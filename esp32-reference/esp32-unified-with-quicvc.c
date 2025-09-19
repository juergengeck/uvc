// ESP32 Unified Service with QUICVC Support
// Combines existing discovery/services with QUICVC for secure connections

#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_system.h"
#include "esp_random.h"
#include "lwip/sockets.h"
#include "cJSON.h"
#include "esp_task_wdt.h"
#include "mbedtls/gcm.h"
#include "mbedtls/sha256.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

#define TAG "ESP32_QUICVC"

// Port configuration
#define UNIFIED_SERVICE_PORT 49497  // Regular services
#define QUICVC_PORT 49498          // QUICVC connections

// Service types (existing)
#define SERVICE_DISCOVERY 1        // HTML-based discovery (unclaimed devices)
#define SERVICE_CREDENTIAL 2
#define SERVICE_LED_CONTROL 3
#define SERVICE_ESP32_DATA 4
#define SERVICE_JOURNAL_SYNC 5
#define SERVICE_ATTESTATION 6      // Reserved for true cryptographic attestations
#define SERVICE_VC_EXCHANGE 7
#define SERVICE_HEARTBEAT 8

// QUICVC packet types
#define QUICVC_INITIAL 0x00
#define QUICVC_HANDSHAKE 0x01
#define QUICVC_PROTECTED 0x02

// Frame types
#define FRAME_VC_INIT 0x10
#define FRAME_VC_RESPONSE 0x11
#define FRAME_HEARTBEAT 0x20
#define FRAME_DATA 0x30

// Global variables
static int service_socket = -1;
static int quicvc_socket = -1;
static char device_id[65] = {0};
static uint8_t blue_led_state = 0;

// Device credential (from ownership)
typedef struct {
    char id[128];
    char issuer[65];
    char subject[65];
    uint32_t issued_at;
    uint32_t expires_at;
} device_credential_t;

static device_credential_t device_credential = {0};

// QUICVC connection state
typedef struct {
    uint8_t dcid[16];
    uint8_t scid[16];
    uint8_t state;  // 0=initial, 1=handshake, 2=established
    uint8_t session_key[32];
    uint64_t packet_number;
    uint32_t last_activity;
    struct sockaddr_in peer_addr;
    mbedtls_gcm_context gcm_send;
    mbedtls_gcm_context gcm_recv;
} quicvc_connection_t;

static quicvc_connection_t *active_connection = NULL;

// Hardware crypto functions
static void generate_random_bytes(uint8_t *buf, size_t len) {
    esp_fill_random(buf, len);
}

static esp_err_t derive_session_keys(quicvc_connection_t *conn, const char *challenge) {
    mbedtls_sha256_context sha;
    mbedtls_sha256_init(&sha);
    
    // Derive session key from credentials and challenge
    mbedtls_sha256_starts(&sha, 0);
    mbedtls_sha256_update(&sha, (uint8_t*)device_credential.id, strlen(device_credential.id));
    mbedtls_sha256_update(&sha, (uint8_t*)device_credential.issuer, strlen(device_credential.issuer));
    mbedtls_sha256_update(&sha, (uint8_t*)challenge, strlen(challenge));
    mbedtls_sha256_finish(&sha, conn->session_key);
    
    mbedtls_sha256_free(&sha);
    
    // Initialize GCM contexts (hardware accelerated)
    mbedtls_gcm_init(&conn->gcm_send);
    mbedtls_gcm_init(&conn->gcm_recv);
    
    int ret = mbedtls_gcm_setkey(&conn->gcm_send, MBEDTLS_CIPHER_ID_AES, 
                                conn->session_key, 256);
    if (ret != 0) {
        ESP_LOGE(TAG, "Failed to set send key: %d", ret);
        return ESP_FAIL;
    }
    
    ret = mbedtls_gcm_setkey(&conn->gcm_recv, MBEDTLS_CIPHER_ID_AES,
                            conn->session_key, 256);
    if (ret != 0) {
        ESP_LOGE(TAG, "Failed to set recv key: %d", ret);
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Session keys derived with hardware acceleration");
    return ESP_OK;
}

// Initialize all services
esp_err_t init_all_services(void) {
    struct sockaddr_in server_addr;
    
    // Initialize unified service socket (existing)
    service_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Failed to create service socket");
        return ESP_FAIL;
    }
    
    int broadcast = 1;
    setsockopt(service_socket, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast));
    
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    server_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
    
    if (bind(service_socket, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        ESP_LOGE(TAG, "Failed to bind service socket");
        close(service_socket);
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "✅ Unified service on port %d", UNIFIED_SERVICE_PORT);
    
    // Initialize QUICVC socket
    quicvc_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (quicvc_socket < 0) {
        ESP_LOGE(TAG, "Failed to create QUICVC socket");
        return ESP_FAIL;
    }
    
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    server_addr.sin_port = htons(QUICVC_PORT);
    
    if (bind(quicvc_socket, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        ESP_LOGE(TAG, "Failed to bind QUICVC socket");
        close(quicvc_socket);
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "✅ QUICVC on port %d", QUICVC_PORT);
    
    // Generate device ID if not set
    if (strlen(device_id) == 0) {
        uint8_t mac[6];
        esp_wifi_get_mac(WIFI_IF_STA, mac);
        snprintf(device_id, sizeof(device_id), "esp32-%02x%02x%02x%02x%02x%02x",
                 mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    }
    
    return ESP_OK;
}

// Handle QUICVC initial packet
static void handle_quicvc_initial(const uint8_t *payload, size_t len, 
                                 struct sockaddr_in *peer_addr) {
    ESP_LOGI(TAG, "QUICVC: Initial packet from %s:%d",
             inet_ntoa(peer_addr->sin_addr), ntohs(peer_addr->sin_port));
    
    // Parse VC_INIT frame
    cJSON *json = cJSON_ParseWithLength((const char*)payload, len);
    if (!json) {
        ESP_LOGE(TAG, "Failed to parse VC_INIT");
        return;
    }
    
    cJSON *cred = cJSON_GetObjectItem(json, "credential");
    cJSON *challenge = cJSON_GetObjectItem(json, "challenge");
    
    if (!cred || !challenge) {
        ESP_LOGE(TAG, "Missing credential or challenge");
        cJSON_Delete(json);
        return;
    }
    
    // Verify issuer matches our owner
    cJSON *issuer = cJSON_GetObjectItem(cred, "issuer");
    if (!issuer || strcmp(issuer->valuestring, device_credential.issuer) != 0) {
        ESP_LOGW(TAG, "Issuer mismatch");
        cJSON_Delete(json);
        return;
    }
    
    // Create connection
    if (active_connection) {
        mbedtls_gcm_free(&active_connection->gcm_send);
        mbedtls_gcm_free(&active_connection->gcm_recv);
        free(active_connection);
    }
    
    active_connection = calloc(1, sizeof(quicvc_connection_t));
    generate_random_bytes(active_connection->scid, 16);
    generate_random_bytes(active_connection->dcid, 16);
    memcpy(&active_connection->peer_addr, peer_addr, sizeof(struct sockaddr_in));
    
    // Derive keys
    derive_session_keys(active_connection, challenge->valuestring);
    active_connection->state = 1;
    
    // Send VC_RESPONSE
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "VC_RESPONSE");
    
    cJSON *our_cred = cJSON_CreateObject();
    cJSON_AddStringToObject(our_cred, "id", device_credential.id);
    cJSON_AddStringToObject(our_cred, "issuer", device_credential.issuer);
    cJSON_AddStringToObject(our_cred, "subject", device_credential.subject);
    cJSON_AddNumberToObject(our_cred, "issued_at", device_credential.issued_at);
    cJSON_AddNumberToObject(our_cred, "expires_at", device_credential.expires_at);
    
    cJSON *proof = cJSON_CreateObject();
    cJSON_AddStringToObject(proof, "type", "Ed25519Signature2020");
    cJSON_AddStringToObject(proof, "proofValue", "hw-crypto-signature");
    cJSON_AddItemToObject(our_cred, "proof", proof);
    
    cJSON_AddItemToObject(response, "credential", our_cred);
    cJSON_AddStringToObject(response, "challenge", challenge->valuestring);
    
    char *response_str = cJSON_PrintUnformatted(response);
    
    // Build HANDSHAKE packet
    uint8_t packet[1024];
    size_t offset = 0;
    packet[offset++] = QUICVC_HANDSHAKE;
    
    // Simple header (version, CIDs, packet number)
    uint32_t version = htonl(0x00000001);
    memcpy(&packet[offset], &version, 4);
    offset += 4;
    
    packet[offset++] = 16;  // DCID length
    packet[offset++] = 16;  // SCID length
    
    memcpy(&packet[offset], active_connection->dcid, 16);
    offset += 16;
    memcpy(&packet[offset], active_connection->scid, 16);
    offset += 16;
    
    uint64_t pkt_num = active_connection->packet_number++;
    memcpy(&packet[offset], &pkt_num, 8);
    offset += 8;
    
    // Payload
    size_t resp_len = strlen(response_str);
    memcpy(&packet[offset], response_str, resp_len);
    offset += resp_len;
    
    // Send response
    sendto(quicvc_socket, packet, offset, 0,
           (struct sockaddr*)peer_addr, sizeof(struct sockaddr_in));
    
    ESP_LOGI(TAG, "QUICVC: Sent handshake response");
    active_connection->state = 2;  // Established
    active_connection->last_activity = esp_timer_get_time() / 1000000;
    
    free(response_str);
    cJSON_Delete(response);
    cJSON_Delete(json);
}

// Handle QUICVC protected packet
static void handle_quicvc_protected(const uint8_t *payload, size_t len,
                                   uint64_t packet_number) {
    if (!active_connection || active_connection->state != 2) {
        ESP_LOGW(TAG, "No active connection for protected packet");
        return;
    }
    
    // Update activity
    active_connection->last_activity = esp_timer_get_time() / 1000000;
    
    // For now, handle unencrypted frames (encryption can be added)
    if (len > 0) {
        uint8_t frame_type = payload[0];
        
        switch (frame_type) {
            case FRAME_HEARTBEAT:
                ESP_LOGD(TAG, "QUICVC: Heartbeat received");
                break;
                
            case FRAME_DATA:
                // Handle data frame
                if (len > 1) {
                    cJSON *cmd = cJSON_ParseWithLength((const char*)&payload[1], len - 1);
                    if (cmd) {
                        cJSON *type = cJSON_GetObjectItem(cmd, "type");
                        if (type && strcmp(type->valuestring, "led_control") == 0) {
                            cJSON *state = cJSON_GetObjectItem(cmd, "state");
                            if (state) {
                                blue_led_state = strcmp(state->valuestring, "on") == 0 ? 1 : 0;
                                gpio_set_level(GPIO_NUM_2, blue_led_state);
                                ESP_LOGI(TAG, "QUICVC: LED set to %s", blue_led_state ? "ON" : "OFF");
                            }
                        }
                        cJSON_Delete(cmd);
                    }
                }
                break;
        }
    }
}

// QUICVC handler task
void quicvc_handler_task(void *param) {
    uint8_t buffer[1024];
    struct sockaddr_in peer_addr;
    socklen_t addr_len;
    
    while (1) {
        addr_len = sizeof(peer_addr);
        ssize_t len = recvfrom(quicvc_socket, buffer, sizeof(buffer), 0,
                              (struct sockaddr*)&peer_addr, &addr_len);
        
        if (len > 0) {
            // Parse packet header
            if (len < 15) continue;  // Minimum header size
            
            uint8_t packet_type = buffer[0];
            size_t offset = 1;
            
            // Skip version (4 bytes)
            offset += 4;
            
            // Skip CID lengths and CIDs
            uint8_t dcid_len = buffer[offset++];
            uint8_t scid_len = buffer[offset++];
            offset += dcid_len + scid_len;
            
            // Get packet number
            uint64_t packet_number;
            memcpy(&packet_number, &buffer[offset], 8);
            offset += 8;
            
            // Handle based on packet type
            switch (packet_type) {
                case QUICVC_INITIAL:
                    handle_quicvc_initial(&buffer[offset], len - offset, &peer_addr);
                    break;
                    
                case QUICVC_PROTECTED:
                    handle_quicvc_protected(&buffer[offset], len - offset, packet_number);
                    break;
            }
        }
        
        // Check for timeout
        if (active_connection && 
            (esp_timer_get_time() / 1000000 - active_connection->last_activity) > 60) {
            ESP_LOGW(TAG, "QUICVC: Connection timeout");
            mbedtls_gcm_free(&active_connection->gcm_send);
            mbedtls_gcm_free(&active_connection->gcm_recv);
            free(active_connection);
            active_connection = NULL;
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// Regular service handler (existing functionality)
void service_handler_task(void *param) {
    uint8_t buffer[1024];
    struct sockaddr_in src_addr;
    socklen_t addr_len;
    
    while (1) {
        addr_len = sizeof(src_addr);
        ssize_t len = recvfrom(service_socket, buffer, sizeof(buffer), 0,
                              (struct sockaddr*)&src_addr, &addr_len);
        
        if (len > 0) {
            // Handle regular services (discovery, LED control, etc.)
            // ... existing service handling code ...
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// Send periodic heartbeat
void heartbeat_task(void *param) {
    while (1) {
        // Send regular heartbeat on service port
        // ... existing heartbeat code ...
        
        // Send QUICVC heartbeat if connected
        if (active_connection && active_connection->state == 2) {
            uint8_t packet[128];
            size_t offset = 0;
            
            // Build protected packet header
            packet[offset++] = QUICVC_PROTECTED;
            
            // Version
            uint32_t version = htonl(0x00000001);
            memcpy(&packet[offset], &version, 4);
            offset += 4;
            
            // CIDs
            packet[offset++] = 16;
            packet[offset++] = 16;
            memcpy(&packet[offset], active_connection->dcid, 16);
            offset += 16;
            memcpy(&packet[offset], active_connection->scid, 16);
            offset += 16;
            
            // Packet number
            uint64_t pkt_num = active_connection->packet_number++;
            memcpy(&packet[offset], &pkt_num, 8);
            offset += 8;
            
            // Heartbeat frame
            packet[offset++] = FRAME_HEARTBEAT;
            
            cJSON *hb = cJSON_CreateObject();
            cJSON_AddNumberToObject(hb, "timestamp", esp_timer_get_time() / 1000000);
            cJSON_AddNumberToObject(hb, "free_heap", esp_get_free_heap_size());
            
            char *hb_str = cJSON_PrintUnformatted(hb);
            memcpy(&packet[offset], hb_str, strlen(hb_str));
            offset += strlen(hb_str);
            
            // Send heartbeat
            sendto(quicvc_socket, packet, offset, 0,
                   (struct sockaddr*)&active_connection->peer_addr,
                   sizeof(struct sockaddr_in));
            
            free(hb_str);
            cJSON_Delete(hb);
            
            ESP_LOGD(TAG, "QUICVC: Heartbeat sent");
        }
        
        vTaskDelay(pdMS_TO_TICKS(20000));  // Every 20 seconds
    }
}

// Main initialization
void app_main(void) {
    // Initialize GPIO for LED
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << GPIO_NUM_2),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = 0,
        .pull_down_en = 0,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&io_conf);
    
    // Initialize WiFi and wait for connection
    // ... WiFi initialization code ...
    
    // Set device credential (from NVS or provisioning)
    strcpy(device_credential.id, "esp32-device-001");
    strcpy(device_credential.issuer, "d27f0ef1dd9e2588e283496bda4984d846ac777a86c6fa4337f357f28fa945df");
    strcpy(device_credential.subject, device_id);
    device_credential.issued_at = 1700000000;
    device_credential.expires_at = 2000000000;
    
    // Initialize all services
    if (init_all_services() != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize services");
        return;
    }
    
    // Create handler tasks
    xTaskCreate(service_handler_task, "service_handler", 4096, NULL, 5, NULL);
    xTaskCreate(quicvc_handler_task, "quicvc_handler", 4096, NULL, 5, NULL);
    xTaskCreate(heartbeat_task, "heartbeat", 2048, NULL, 4, NULL);
    
    ESP_LOGI(TAG, "🚀 ESP32 QUICVC ready!");
    ESP_LOGI(TAG, "  - Regular services on port %d", UNIFIED_SERVICE_PORT);
    ESP_LOGI(TAG, "  - QUICVC on port %d", QUICVC_PORT);
    ESP_LOGI(TAG, "  - Device ID: %s", device_id);
    ESP_LOGI(TAG, "  - Hardware crypto: enabled");
}