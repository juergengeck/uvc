// ESP32 QUIC/QUICVC-Aligned Discovery Fix
// Implements proper discovery based on device ownership state

// Service type definitions (aligned with QUIC/QUICVC)
#define SERVICE_DISCOVERY    0x01  // HTML-based discovery for all devices
#define SERVICE_CREDENTIALS  0x02  // Credential provisioning
#define SERVICE_LED_CONTROL  0x03  // LED control commands
#define SERVICE_ESP32_DATA   0x04  // ESP32 data messages
#define SERVICE_JOURNAL_SYNC 0x05  // Journal synchronization
#define SERVICE_ATTESTATION  0x06  // Reserved for true cryptographic attestations
#define SERVICE_VC_EXCHANGE  0x07  // Verifiable Credential exchange

// Required includes
#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "lwip/sockets.h"
#include "cJSON.h"
#include <arpa/inet.h>
#include "mbedtls/pk.h"
#include "mbedtls/entropy.h"
#include "mbedtls/ctr_drbg.h"
#include "mbedtls/base64.h"

#define TAG "QuicVCDiscovery"

// Global device public key (generated at boot)
static char device_public_key_hex[65] = {0};  // 32 bytes hex = 64 chars + null

// Function to get or generate device public key
static esp_err_t get_device_public_key(char *pubkey_hex, size_t hex_size) {
    nvs_handle_t nvs_handle;
    esp_err_t err;
    
    // Try to read existing public key from NVS
    err = nvs_open("device_keys", NVS_READWRITE, &nvs_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS for device keys");
        return err;
    }
    
    size_t key_len = hex_size;
    err = nvs_get_str(nvs_handle, "public_key", pubkey_hex, &key_len);
    
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        // Generate new Ed25519 key pair
        ESP_LOGI(TAG, "Generating new device key pair...");
        
        // For ESP32, we'll use a simplified approach
        // In production, use proper Ed25519 key generation
        uint8_t pubkey_bytes[32];
        esp_fill_random(pubkey_bytes, 32);  // Simplified for demo
        
        // Convert to hex
        for (int i = 0; i < 32; i++) {
            sprintf(&pubkey_hex[i * 2], "%02x", pubkey_bytes[i]);
        }
        pubkey_hex[64] = '\0';
        
        // Store in NVS
        err = nvs_set_str(nvs_handle, "public_key", pubkey_hex);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to store public key");
        } else {
            nvs_commit(nvs_handle);
            ESP_LOGI(TAG, "Device public key generated and stored");
        }
    }
    
    nvs_close(nvs_handle);
    return ESP_OK;
}

// Send discovery broadcast for UNOWNED devices (Type 1)
// Uses public key as device identifier (QUIC-style)
esp_err_t send_discovery_broadcast_unowned(void) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Get device public key (acts as device ID in QUIC model)
    if (strlen(device_public_key_hex) == 0) {
        if (get_device_public_key(device_public_key_hex, sizeof(device_public_key_hex)) != ESP_OK) {
            ESP_LOGE(TAG, "Failed to get device public key");
            return ESP_FAIL;
        }
    }
    
    // Create QUIC-style discovery message
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "discovery_announce");
    cJSON_AddStringToObject(root, "publicKeyHex", device_public_key_hex);  // Public key as ID
    cJSON_AddStringToObject(root, "deviceType", "ESP32");
    cJSON_AddStringToObject(root, "deviceId", device_id);  // MAC-based ID for compatibility
    cJSON_AddBoolToObject(root, "isOwned", false);
    cJSON_AddNumberToObject(root, "timestamp", esp_timer_get_time() / 1000);
    
    // Add capabilities (what the device can do)
    cJSON *caps = cJSON_CreateArray();
    cJSON_AddItemToArray(caps, cJSON_CreateString("led_control"));
    cJSON_AddItemToArray(caps, cJSON_CreateString("credential_provisioning"));
    cJSON_AddItemToObject(root, "capabilities", caps);
    
    // Convert to string
    char *json_str = cJSON_PrintUnformatted(root);
    if (!json_str) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }
    
    // Create packet with SERVICE_DISCOVERY type
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    packet[0] = SERVICE_DISCOVERY;  // Type 1 for unowned devices
    memcpy(packet + 1, json_str, json_len);
    
    // Send broadcast
    struct sockaddr_in broadcast_addr;
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_addr.s_addr = htonl(INADDR_BROADCAST);
    broadcast_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
    
    ssize_t sent = sendto(service_socket, packet, json_len + 1, 0,
                         (struct sockaddr *)&broadcast_addr, sizeof(broadcast_addr));
    
    free(packet);
    cJSON_Delete(root);
    free(json_str);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send discovery broadcast: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📡 QUIC discovery sent (unowned, pubkey: %.16s..., %d bytes)", 
             device_public_key_hex, (int)sent);
    
    return ESP_OK;
}

// Send attestation/heartbeat for OWNED devices (Type 6)
// Includes verifiable credential for trust establishment
esp_err_t send_attestation_heartbeat_owned(void) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Read stored credential from NVS
    nvs_handle_t nvs_handle;
    char vc_json[2048] = {0};
    size_t vc_len = sizeof(vc_json);
    char owner_id[65] = {0};
    size_t owner_len = sizeof(owner_id);
    
    esp_err_t err = nvs_open("device_cred", NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "No credential storage found");
        return ESP_FAIL;
    }
    
    // Get owner ID and credential
    err = nvs_get_str(nvs_handle, "owner_id", owner_id, &owner_len);
    if (err != ESP_OK) {
        nvs_close(nvs_handle);
        ESP_LOGE(TAG, "No owner ID found");
        return ESP_FAIL;
    }
    
    err = nvs_get_str(nvs_handle, "device_vc", vc_json, &vc_len);
    nvs_close(nvs_handle);
    
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "No credential found");
        return ESP_FAIL;
    }
    
    // Parse the stored credential
    cJSON *vc = cJSON_Parse(vc_json);
    if (!vc) {
        ESP_LOGE(TAG, "Failed to parse stored credential");
        return ESP_FAIL;
    }
    
    // Create VC-based attestation message (QUICVC style)
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "device_attestation");
    cJSON_AddStringToObject(root, "deviceId", device_id);
    cJSON_AddStringToObject(root, "ownerId", owner_id);
    cJSON_AddItemToObject(root, "credential", cJSON_Duplicate(vc, 1));
    cJSON_AddNumberToObject(root, "timestamp", esp_timer_get_time() / 1000);
    cJSON_AddStringToObject(root, "status", "online");
    
    // Add current device state
    cJSON *state = cJSON_CreateObject();
    cJSON_AddBoolToObject(state, "ledBlue", blue_led_state);
    cJSON_AddBoolToObject(state, "manualControl", manual_control);
    cJSON_AddNumberToObject(state, "uptime", esp_timer_get_time() / 1000000);  // Seconds
    cJSON_AddItemToObject(root, "deviceState", state);
    
    cJSON_Delete(vc);
    
    // Convert to string
    char *json_str = cJSON_PrintUnformatted(root);
    if (!json_str) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }
    
    // Create packet with SERVICE_ATTESTATION type
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    packet[0] = SERVICE_DISCOVERY;  // Type 1 for all discovery
    memcpy(packet + 1, json_str, json_len);
    
    // Send broadcast
    struct sockaddr_in broadcast_addr;
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_addr.s_addr = htonl(INADDR_BROADCAST);
    broadcast_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
    
    ssize_t sent = sendto(service_socket, packet, json_len + 1, 0,
                         (struct sockaddr *)&broadcast_addr, sizeof(broadcast_addr));
    
    free(packet);
    cJSON_Delete(root);
    free(json_str);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send attestation heartbeat: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "🔐 VC attestation sent (owned by %.16s..., %d bytes)", 
             owner_id, (int)sent);
    
    return ESP_OK;
}

// Main discovery/heartbeat function that chooses based on ownership
esp_err_t send_discovery_broadcast(void) {
    // Check if device is owned
    nvs_handle_t nvs_handle;
    char owner_id[65] = {0};
    size_t owner_len = sizeof(owner_id);
    bool is_owned = false;
    
    if (nvs_open("device_cred", NVS_READONLY, &nvs_handle) == ESP_OK) {
        if (nvs_get_str(nvs_handle, "owner_id", owner_id, &owner_len) == ESP_OK) {
            is_owned = (strlen(owner_id) > 0);
        }
        nvs_close(nvs_handle);
    }
    
    if (is_owned) {
        // Owned device: Send VC-based attestation (Type 6)
        ESP_LOGI(TAG, "Device is owned, sending VC attestation");
        return send_attestation_heartbeat_owned();
    } else {
        // Unowned device: Send public key discovery (Type 1)
        ESP_LOGI(TAG, "Device is unowned, sending QUIC discovery");
        return send_discovery_broadcast_unowned();
    }
}

// Handle incoming discovery requests (Type 1)
void handle_discovery_request(const uint8_t *data, size_t len, const char *sender_ip, int sender_port) {
    ESP_LOGI(TAG, "Received discovery request from %s:%d", sender_ip, sender_port);
    
    // Parse the request
    cJSON *request = cJSON_ParseWithLength((const char *)(data + 1), len - 1);
    if (!request) {
        ESP_LOGE(TAG, "Failed to parse discovery request");
        return;
    }
    
    // Check if it's a discovery query
    const char *type = cJSON_GetStringValue(cJSON_GetObjectItem(request, "type"));
    if (type && strcmp(type, "discovery_query") == 0) {
        // Respond with our current state
        send_discovery_broadcast();
    }
    
    cJSON_Delete(request);
}

// Handle incoming attestation messages (Type 6)
void handle_attestation_message(const uint8_t *data, size_t len, const char *sender_ip, int sender_port) {
    ESP_LOGI(TAG, "Received attestation from %s:%d", sender_ip, sender_port);
    
    // Parse the attestation
    cJSON *attestation = cJSON_ParseWithLength((const char *)(data + 1), len - 1);
    if (!attestation) {
        ESP_LOGE(TAG, "Failed to parse attestation");
        return;
    }
    
    // Extract device info
    const char *device_id = cJSON_GetStringValue(cJSON_GetObjectItem(attestation, "deviceId"));
    const char *owner_id = cJSON_GetStringValue(cJSON_GetObjectItem(attestation, "ownerId"));
    
    if (device_id && owner_id) {
        ESP_LOGI(TAG, "Device %s owned by %.16s... is online", device_id, owner_id);
        // Could maintain a peer device registry here
    }
    
    cJSON_Delete(attestation);
}

// Update the main service handler to use these functions
void unified_service_handler(const uint8_t *data, size_t len, const char *sender_ip, int sender_port) {
    if (len < 1) {
        ESP_LOGE(TAG, "Message too short");
        return;
    }
    
    uint8_t service_type = data[0];
    
    switch (service_type) {
        case SERVICE_DISCOVERY:
            handle_discovery_request(data, len, sender_ip, sender_port);
            break;
            
        case SERVICE_DISCOVERY:  // Handle discovery on type 1
            handle_attestation_message(data, len, sender_ip, sender_port);
            break;
            
        case SERVICE_LED_CONTROL:
            handle_led_control(data, len, sender_ip, sender_port);
            break;
            
        case SERVICE_CREDENTIALS:
            handle_credential_provisioning(data, len, sender_ip, sender_port);
            break;
            
        case SERVICE_VC_EXCHANGE:
            handle_vc_exchange(data, len, sender_ip, sender_port);
            break;
            
        default:
            ESP_LOGW(TAG, "Unknown service type: 0x%02x", service_type);
            break;
    }
}

// Periodic broadcast task update
void discovery_task(void *pvParameters) {
    while (1) {
        // Check ownership and send appropriate message type
        send_discovery_broadcast();
        
        // Different intervals for owned vs unowned
        nvs_handle_t nvs_handle;
        bool is_owned = false;
        if (nvs_open("device_cred", NVS_READONLY, &nvs_handle) == ESP_OK) {
            char owner_id[65];
            size_t owner_len = sizeof(owner_id);
            is_owned = (nvs_get_str(nvs_handle, "owner_id", owner_id, &owner_len) == ESP_OK);
            nvs_close(nvs_handle);
        }
        
        if (is_owned) {
            // Owned devices: Heartbeat every 30 seconds
            vTaskDelay(pdMS_TO_TICKS(30000));
        } else {
            // Unowned devices: Discovery every 5 seconds
            vTaskDelay(pdMS_TO_TICKS(5000));
        }
    }
}