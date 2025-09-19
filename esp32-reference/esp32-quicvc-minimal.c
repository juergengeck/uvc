// ESP32 Minimal QUICVC Implementation
// Handles VC-based authentication and basic packet exchange
// Not a full QUIC implementation - just enough for secure device communication

#include "esp_log.h"
#include "esp_wifi.h"
#include "lwip/sockets.h"
#include "cJSON.h"
#include "mbedtls/sha256.h"
#include "mbedtls/base64.h"
#include "esp_random.h"
#include <string.h>

#define TAG "QUICVC"

// QUICVC Configuration
#define QUICVC_PORT 49498          // Different from discovery port
#define QUICVC_VERSION 0x00000001  // Version 1
#define CONNECTION_ID_LEN 16       // Connection ID length

// Simplified packet types
#define QUICVC_INITIAL 0x00
#define QUICVC_HANDSHAKE 0x01
#define QUICVC_PROTECTED 0x02

// Frame types
#define FRAME_VC_INIT 0x10
#define FRAME_VC_RESPONSE 0x11
#define FRAME_HEARTBEAT 0x20
#define FRAME_DATA 0x30

// Connection state
typedef struct {
    uint8_t dcid[CONNECTION_ID_LEN];  // Destination connection ID
    uint8_t scid[CONNECTION_ID_LEN];  // Source connection ID
    uint8_t state;                    // 0=initial, 1=handshake, 2=established
    uint8_t session_key[32];          // Simplified: single session key
    uint64_t packet_number;
    uint32_t last_activity;
} quicvc_connection_t;

// Global state
static int quicvc_socket = -1;
static quicvc_connection_t *active_connection = NULL;
extern device_identity_credential_t device_credential;  // From main code
extern char device_id[65];

// Initialize QUICVC listener
esp_err_t quicvc_init(void) {
    struct sockaddr_in server_addr;
    
    // Create UDP socket
    quicvc_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (quicvc_socket < 0) {
        ESP_LOGE(TAG, "Failed to create QUICVC socket");
        return ESP_FAIL;
    }
    
    // Bind to QUICVC port
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    server_addr.sin_port = htons(QUICVC_PORT);
    
    if (bind(quicvc_socket, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        ESP_LOGE(TAG, "Failed to bind QUICVC socket to port %d", QUICVC_PORT);
        close(quicvc_socket);
        quicvc_socket = -1;
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "QUICVC listening on port %d", QUICVC_PORT);
    return ESP_OK;
}

// Simple key derivation from credentials
static void derive_session_key(const char *local_cred_id, const char *remote_cred_id, 
                              const char *challenge, uint8_t *out_key) {
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);
    
    // Mix credential IDs and challenge
    mbedtls_sha256_update(&ctx, (uint8_t*)local_cred_id, strlen(local_cred_id));
    mbedtls_sha256_update(&ctx, (uint8_t*)remote_cred_id, strlen(remote_cred_id));
    mbedtls_sha256_update(&ctx, (uint8_t*)challenge, strlen(challenge));
    
    // Add salt
    const uint8_t salt[] = "quicvc-esp32-v1";
    mbedtls_sha256_update(&ctx, salt, sizeof(salt));
    
    mbedtls_sha256_finish(&ctx, out_key);
    mbedtls_sha256_free(&ctx);
}

// Parse packet header (simplified)
static int parse_packet_header(const uint8_t *data, size_t len, 
                              uint8_t *packet_type, uint8_t *dcid, uint8_t *scid) {
    if (len < 1 + 4 + 1 + 1 + 2*CONNECTION_ID_LEN + 8) {
        return -1;
    }
    
    size_t offset = 0;
    *packet_type = data[offset++];
    
    // Skip version (4 bytes)
    offset += 4;
    
    // Connection ID lengths
    uint8_t dcid_len = data[offset++];
    uint8_t scid_len = data[offset++];
    
    if (dcid_len != CONNECTION_ID_LEN || scid_len != CONNECTION_ID_LEN) {
        return -1;
    }
    
    // Copy connection IDs
    memcpy(dcid, &data[offset], CONNECTION_ID_LEN);
    offset += CONNECTION_ID_LEN;
    memcpy(scid, &data[offset], CONNECTION_ID_LEN);
    offset += CONNECTION_ID_LEN;
    
    // Skip packet number (8 bytes)
    offset += 8;
    
    return offset;  // Return header size
}

// Handle VC_INIT frame
static void handle_vc_init(const uint8_t *payload, size_t len, 
                          struct sockaddr_in *client_addr, socklen_t addr_len) {
    ESP_LOGI(TAG, "Received VC_INIT from %s:%d", 
             inet_ntoa(client_addr->sin_addr), ntohs(client_addr->sin_port));
    
    // Parse JSON payload
    cJSON *json = cJSON_ParseWithLength((const char*)payload, len);
    if (!json) {
        ESP_LOGE(TAG, "Failed to parse VC_INIT JSON");
        return;
    }
    
    // Extract credential and challenge
    cJSON *cred_json = cJSON_GetObjectItem(json, "credential");
    cJSON *challenge = cJSON_GetObjectItem(json, "challenge");
    
    if (!cred_json || !challenge) {
        ESP_LOGE(TAG, "Missing credential or challenge");
        cJSON_Delete(json);
        return;
    }
    
    // Verify issuer matches our owner
    cJSON *issuer = cJSON_GetObjectItem(cred_json, "issuer");
    if (!issuer || strcmp(issuer->valuestring, device_credential.issuer) != 0) {
        ESP_LOGW(TAG, "VC issuer doesn't match our owner");
        cJSON_Delete(json);
        return;
    }
    
    // Create connection
    if (active_connection) {
        free(active_connection);
    }
    active_connection = calloc(1, sizeof(quicvc_connection_t));
    
    // Generate connection IDs (swap for server)
    esp_fill_random(active_connection->scid, CONNECTION_ID_LEN);
    memcpy(active_connection->dcid, active_connection->scid, CONNECTION_ID_LEN);
    
    // Derive session key
    derive_session_key(device_id, issuer->valuestring, 
                      challenge->valuestring, active_connection->session_key);
    
    active_connection->state = 1;  // Handshake
    active_connection->last_activity = esp_timer_get_time() / 1000000;
    
    // Send VC_RESPONSE
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "VC_RESPONSE");
    
    // Add our credential
    cJSON *our_cred = cJSON_CreateObject();
    cJSON_AddStringToObject(our_cred, "id", device_credential.id);
    cJSON_AddStringToObject(our_cred, "issuer", device_credential.issuer);
    cJSON_AddStringToObject(our_cred, "subject", device_credential.subject);
    cJSON_AddNumberToObject(our_cred, "issued_at", device_credential.issued_at);
    cJSON_AddNumberToObject(our_cred, "expires_at", device_credential.expires_at);
    
    // Add proof (simplified - just a signature placeholder)
    cJSON *proof = cJSON_CreateObject();
    cJSON_AddStringToObject(proof, "type", "Ed25519Signature2020");
    cJSON_AddStringToObject(proof, "proofValue", "placeholder-signature");
    cJSON_AddItemToObject(our_cred, "proof", proof);
    
    cJSON_AddItemToObject(response, "credential", our_cred);
    cJSON_AddStringToObject(response, "challenge", challenge->valuestring);
    cJSON_AddNumberToObject(response, "timestamp", esp_timer_get_time() / 1000);
    
    // Create HANDSHAKE packet
    char *response_str = cJSON_PrintUnformatted(response);
    size_t response_len = strlen(response_str);
    
    // Build packet (simplified header)
    uint8_t packet[1024];
    size_t offset = 0;
    
    // Packet type
    packet[offset++] = QUICVC_HANDSHAKE;
    
    // Version
    uint32_t version = htonl(QUICVC_VERSION);
    memcpy(&packet[offset], &version, 4);
    offset += 4;
    
    // Connection ID lengths
    packet[offset++] = CONNECTION_ID_LEN;
    packet[offset++] = CONNECTION_ID_LEN;
    
    // Connection IDs
    memcpy(&packet[offset], active_connection->dcid, CONNECTION_ID_LEN);
    offset += CONNECTION_ID_LEN;
    memcpy(&packet[offset], active_connection->scid, CONNECTION_ID_LEN);
    offset += CONNECTION_ID_LEN;
    
    // Packet number
    uint64_t pkt_num = active_connection->packet_number++;
    memcpy(&packet[offset], &pkt_num, 8);
    offset += 8;
    
    // Payload
    memcpy(&packet[offset], response_str, response_len);
    offset += response_len;
    
    // Send response
    sendto(quicvc_socket, packet, offset, 0, 
           (struct sockaddr*)client_addr, addr_len);
    
    ESP_LOGI(TAG, "Sent VC_RESPONSE, connection established");
    active_connection->state = 2;  // Established
    
    free(response_str);
    cJSON_Delete(response);
    cJSON_Delete(json);
}

// Handle incoming QUICVC packets
void quicvc_handle_packet(void) {
    uint8_t buffer[1024];
    struct sockaddr_in client_addr;
    socklen_t addr_len = sizeof(client_addr);
    
    ssize_t len = recvfrom(quicvc_socket, buffer, sizeof(buffer), MSG_DONTWAIT,
                          (struct sockaddr*)&client_addr, &addr_len);
    
    if (len <= 0) return;
    
    // Parse header
    uint8_t packet_type, dcid[CONNECTION_ID_LEN], scid[CONNECTION_ID_LEN];
    int header_size = parse_packet_header(buffer, len, &packet_type, dcid, scid);
    
    if (header_size < 0) {
        ESP_LOGW(TAG, "Invalid packet header");
        return;
    }
    
    // Get payload
    uint8_t *payload = &buffer[header_size];
    size_t payload_len = len - header_size;
    
    switch (packet_type) {
        case QUICVC_INITIAL:
            // Check for VC_INIT frame
            if (payload_len > 0 && payload[0] == FRAME_VC_INIT) {
                handle_vc_init(payload, payload_len, &client_addr, addr_len);
            }
            break;
            
        case QUICVC_PROTECTED:
            // Handle encrypted packets (simplified - no actual encryption yet)
            if (active_connection && active_connection->state == 2) {
                // Update activity
                active_connection->last_activity = esp_timer_get_time() / 1000000;
                
                // Handle heartbeat
                if (payload_len > 0 && payload[0] == FRAME_HEARTBEAT) {
                    ESP_LOGD(TAG, "Received heartbeat");
                    // Could send response if needed
                }
                // Handle data
                else if (payload_len > 0 && payload[0] == FRAME_DATA) {
                    ESP_LOGI(TAG, "Received data frame: %.*s", 
                             (int)(payload_len - 1), &payload[1]);
                }
            }
            break;
    }
}

// Send heartbeat (if connected)
void quicvc_send_heartbeat(void) {
    if (!active_connection || active_connection->state != 2) {
        return;
    }
    
    // Check for timeout (60 seconds)
    uint32_t now = esp_timer_get_time() / 1000000;
    if (now - active_connection->last_activity > 60) {
        ESP_LOGW(TAG, "QUICVC connection timeout");
        free(active_connection);
        active_connection = NULL;
        return;
    }
    
    // Build heartbeat frame
    uint8_t heartbeat[64];
    heartbeat[0] = FRAME_HEARTBEAT;
    
    cJSON *hb = cJSON_CreateObject();
    cJSON_AddNumberToObject(hb, "timestamp", now);
    cJSON_AddNumberToObject(hb, "sequence", active_connection->packet_number);
    
    char *hb_str = cJSON_PrintUnformatted(hb);
    memcpy(&heartbeat[1], hb_str, strlen(hb_str));
    
    // Would send encrypted packet here
    ESP_LOGD(TAG, "Heartbeat ready (encryption not implemented)");
    
    free(hb_str);
    cJSON_Delete(hb);
}

// Cleanup
void quicvc_cleanup(void) {
    if (quicvc_socket >= 0) {
        close(quicvc_socket);
        quicvc_socket = -1;
    }
    if (active_connection) {
        free(active_connection);
        active_connection = NULL;
    }
}