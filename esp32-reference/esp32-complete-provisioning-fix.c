// ESP32 Complete Provisioning Fix
// This fixes the provisioning flow to correctly handle credentials and stop discovery

#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "cJSON.h"
#include <string.h>

#define TAG "ESP32-Provisioning"

// Service type definitions (must match app)
#define SERVICE_TYPE_CREDENTIALS  0x02  // Credential provisioning and ownership

// Global variables
extern int service_socket;
extern char device_id[32];
extern bool discovery_active;  // Flag to control discovery broadcasts

// Forward declarations
esp_err_t get_owner_id(char *owner_id, size_t max_len);
void stop_discovery_broadcasts(void);
void start_discovery_broadcasts(void);

// Handle credential provisioning messages (Service Type 2)
void handle_credential_provisioning(const uint8_t *data, size_t len, const char *sender_ip, int sender_port) {
    ESP_LOGI(TAG, "📥 Received credential message from %s:%d (%d bytes)", sender_ip, sender_port, (int)len);
    
    // Skip service type byte
    if (len < 2) {
        ESP_LOGE(TAG, "Credential message too short");
        return;
    }
    
    // Parse JSON message
    cJSON *root = cJSON_ParseWithLength((const char *)(data + 1), len - 1);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse credential JSON");
        return;
    }
    
    // Get message type
    const char *type = cJSON_GetStringValue(cJSON_GetObjectItem(root, "type"));
    if (!type) {
        ESP_LOGE(TAG, "No type field in credential message");
        cJSON_Delete(root);
        return;
    }
    
    ESP_LOGI(TAG, "Credential message type: %s", type);
    
    if (strcmp(type, "provision_device") == 0) {
        // Handle device provisioning
        cJSON *credential = cJSON_GetObjectItem(root, "credential");
        if (!credential) {
            ESP_LOGE(TAG, "No credential in provision message");
            cJSON_Delete(root);
            return;
        }
        
        // Extract issuer (owner ID) - this is the Person ID of the owner
        const char *issuer = cJSON_GetStringValue(cJSON_GetObjectItem(credential, "issuer"));
        if (!issuer || strlen(issuer) != 64) {  // Person IDs are 64 chars
            ESP_LOGE(TAG, "Invalid or missing issuer (owner ID): %s", issuer ? issuer : "null");
            cJSON_Delete(root);
            return;
        }
        
        // Check if already owned
        if (is_device_owned()) {
            char current_owner[65] = {0};
            get_owner_id(current_owner, sizeof(current_owner));
            ESP_LOGW(TAG, "Device already owned by: %.16s...", current_owner);
            
            // Send rejection response
            send_provisioning_response(sender_ip, sender_port, false, "already_owned", NULL);
            cJSON_Delete(root);
            return;
        }
        
        // Store the credential
        char *credential_str = cJSON_PrintUnformatted(credential);
        if (credential_str) {
            esp_err_t err = store_ownership_credential(issuer, credential_str);
            if (err == ESP_OK) {
                ESP_LOGI(TAG, "✅ Device successfully provisioned!");
                ESP_LOGI(TAG, "Owner: %.64s", issuer);
                
                // CRITICAL: Stop discovery broadcasts immediately
                ESP_LOGI(TAG, "🔇 Stopping discovery broadcasts - device is now owned");
                stop_discovery_broadcasts();
                discovery_active = false;
                
                // Send success response with owner ID
                send_provisioning_response(sender_ip, sender_port, true, "provisioned", issuer);
                
                // Update cached ownership status
                invalidate_ownership_cache();
                
                // Device is now in silent mode - will only send heartbeats
                ESP_LOGI(TAG, "💓 Device in silent mode - will send heartbeats to connected peers");
            } else {
                ESP_LOGE(TAG, "Failed to store credential: %s", esp_err_to_name(err));
                send_provisioning_response(sender_ip, sender_port, false, "storage_error", NULL);
            }
            free(credential_str);
        }
        
    } else if (strcmp(type, "ownership_remove") == 0) {
        // Handle ownership removal
        const char *sender_person_id = cJSON_GetStringValue(cJSON_GetObjectItem(root, "senderPersonId"));
        if (!sender_person_id) {
            ESP_LOGE(TAG, "No senderPersonId in removal request");
            cJSON_Delete(root);
            return;
        }
        
        // Verify sender is the current owner
        char current_owner[65] = {0};
        if (get_owner_id(current_owner, sizeof(current_owner)) == ESP_OK) {
            if (strcmp(current_owner, sender_person_id) == 0) {
                // Authorized - remove ownership
                esp_err_t err = clear_ownership();
                if (err == ESP_OK) {
                    ESP_LOGI(TAG, "✅ Ownership removed by owner");
                    
                    // CRITICAL: Resume discovery broadcasts
                    ESP_LOGI(TAG, "📢 Resuming discovery broadcasts - device is unclaimed");
                    start_discovery_broadcasts();
                    discovery_active = true;
                    
                    send_provisioning_response(sender_ip, sender_port, true, "ownership_removed", NULL);
                    
                    // Update cached ownership status
                    invalidate_ownership_cache();
                    
                    // Restart after 3 seconds to ensure clean state
                    vTaskDelay(pdMS_TO_TICKS(3000));
                    esp_restart();
                }
            } else {
                ESP_LOGW(TAG, "Unauthorized removal attempt from: %.16s...", sender_person_id);
                send_provisioning_response(sender_ip, sender_port, false, "unauthorized", NULL);
            }
        } else {
            ESP_LOGW(TAG, "Device not owned, cannot remove ownership");
            send_provisioning_response(sender_ip, sender_port, false, "not_owned", NULL);
        }
    }
    
    cJSON_Delete(root);
}

// Send provisioning response with owner information
esp_err_t send_provisioning_response(const char *target_ip, int target_port, 
                                     bool success, const char *status, 
                                     const char *owner_id) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Create response
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "provisioning_ack");
    cJSON_AddStringToObject(root, "deviceId", device_id);  // Note: camelCase for consistency
    cJSON_AddBoolToObject(root, "success", success);
    cJSON_AddStringToObject(root, "status", status);
    cJSON_AddNumberToObject(root, "timestamp", esp_timer_get_time() / 1000);
    
    // Add owner ID if provided (for successful provisioning)
    if (success && owner_id) {
        cJSON_AddStringToObject(root, "owner", owner_id);
        ESP_LOGI(TAG, "Including owner ID in provisioning_ack: %.16s...", owner_id);
    }
    
    char *json_str = cJSON_PrintUnformatted(root);
    if (!json_str) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }
    
    // Create packet with SERVICE_TYPE_CREDENTIALS (2)
    // App's ESP32ConnectionManager listens on both type 2 and type 11
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    packet[0] = SERVICE_TYPE_CREDENTIALS;  // Type 2
    memcpy(packet + 1, json_str, json_len);
    
    // Send response
    struct sockaddr_in target_addr;
    memset(&target_addr, 0, sizeof(target_addr));
    target_addr.sin_family = AF_INET;
    target_addr.sin_port = htons(target_port);
    inet_pton(AF_INET, target_ip, &target_addr.sin_addr);
    
    ssize_t sent = sendto(service_socket, packet, json_len + 1, 0,
                         (struct sockaddr *)&target_addr, sizeof(target_addr));
    
    free(packet);
    cJSON_Delete(root);
    free(json_str);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send provisioning response: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📤 Provisioning ack sent on service type 2: %s", status);
    return ESP_OK;
}

// Stop discovery broadcasts when device becomes owned
void stop_discovery_broadcasts(void) {
    // This should stop any discovery timer or task
    // Implementation depends on your main loop structure
    ESP_LOGI(TAG, "Discovery broadcasts stopped - device is owned");
}

// Resume discovery broadcasts when ownership is removed
void start_discovery_broadcasts(void) {
    // This should start the discovery timer or task
    // Implementation depends on your main loop structure
    ESP_LOGI(TAG, "Discovery broadcasts resumed - device is unclaimed");
}

// Invalidate cached ownership status to force re-check
void invalidate_ownership_cache(void) {
    extern bool cached_ownership_checked;
    cached_ownership_checked = false;
}

// In your main discovery loop, check ownership before broadcasting:
/*
void discovery_task(void *pvParameters) {
    while (1) {
        // Only broadcast if device is NOT owned
        if (!is_device_owned() && discovery_active) {
            send_discovery_broadcast();
        }
        vTaskDelay(pdMS_TO_TICKS(5000));  // 5 second interval
    }
}
*/