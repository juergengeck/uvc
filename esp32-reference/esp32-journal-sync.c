/**
 * ESP32 Journal Sync Handler
 * 
 * Provides journal synchronization via service type 5
 * Allows apps to retrieve verifiable journal entries from the device
 */

#include "esp_log.h"
#include "nvs_flash.h"
#include "cJSON.h"
#include <string.h>
#include "esp32-service-types.h"

static const char *TAG = "JOURNAL_SYNC";

// Handler for journal sync requests (service type 5)
void handle_journal_sync_message(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    ESP_LOGI(TAG, "Received journal sync request from %s:%d", 
             inet_ntoa(source->sin_addr), ntohs(source->sin_port));
    
    // Skip service type byte
    if (len < 2) return;
    
    // Parse request
    const char *json_str = (const char*)(data + 1);
    cJSON *request = cJSON_Parse(json_str);
    if (!request) {
        ESP_LOGE(TAG, "Failed to parse journal sync request");
        return;
    }
    
    // Get request type
    cJSON *type_item = cJSON_GetObjectItem(request, "type");
    if (!type_item || strcmp(type_item->valuestring, "journal_sync") != 0) {
        cJSON_Delete(request);
        return;
    }
    
    // Get requested range
    cJSON *from_item = cJSON_GetObjectItem(request, "from_index");
    cJSON *count_item = cJSON_GetObjectItem(request, "count");
    
    uint32_t from_index = from_item ? from_item->valueint : 0;
    uint32_t count = count_item ? count_item->valueint : 10;
    
    // Limit count
    if (count > 50) count = 50;
    
    ESP_LOGI(TAG, "Journal sync request: from_index=%d, count=%d", from_index, count);
    
    // Build response with journal entries
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "journal_sync_response");
    cJSON_AddStringToObject(response, "device_id", get_device_id());
    
    // Get current journal index
    uint32_t current_index = 0;
    nvs_get_u32(nvs_handle, "journal_idx", &current_index);
    
    cJSON *entries = cJSON_CreateArray();
    
    // Read journal entries
    for (uint32_t i = 0; i < count; i++) {
        uint32_t idx = (from_index + i) % MAX_JOURNAL_ENTRIES;
        
        // Skip if we've wrapped around to entries that don't exist yet
        if (from_index + i >= current_index) break;
        
        char key[16];
        snprintf(key, sizeof(key), "journal_%d", idx);
        
        // Get entry size
        size_t entry_size = 0;
        esp_err_t err = nvs_get_blob(nvs_handle, key, NULL, &entry_size);
        
        if (err == ESP_OK && entry_size > 0) {
            char *entry_data = malloc(entry_size);
            if (entry_data) {
                err = nvs_get_blob(nvs_handle, key, entry_data, &entry_size);
                if (err == ESP_OK) {
                    cJSON *entry = cJSON_Parse(entry_data);
                    if (entry) {
                        cJSON_AddItemToArray(entries, entry);
                    }
                }
                free(entry_data);
            }
        }
    }
    
    cJSON_AddItemToObject(response, "entries", entries);
    cJSON_AddNumberToObject(response, "total_entries", current_index);
    cJSON_AddNumberToObject(response, "from_index", from_index);
    cJSON_AddNumberToObject(response, "returned_count", cJSON_GetArraySize(entries));
    
    // Send response
    char *response_str = cJSON_PrintUnformatted(response);
    if (response_str) {
        size_t msg_len = strlen(response_str);
        uint8_t *packet = malloc(msg_len + 2);
        
        if (packet) {
            packet[0] = SERVICE_TYPE_JOURNAL_SYNC; // Service type 5
            memcpy(packet + 1, response_str, msg_len + 1);
            
            int sent = sendto(udp_socket, packet, msg_len + 2, 0,
                            (struct sockaddr*)source, sizeof(struct sockaddr_in));
                            
            if (sent < 0) {
                ESP_LOGE(TAG, "Failed to send journal sync response");
            } else {
                ESP_LOGI(TAG, "Sent %d journal entries", cJSON_GetArraySize(entries));
            }
            
            free(packet);
        }
        free(response_str);
    }
    
    cJSON_Delete(response);
    cJSON_Delete(request);
}

// Log device provisioning (ownership establishment or takeover)
void log_device_provisioning(const char *new_owner, const char *previous_owner) {
    if (previous_owner && strlen(previous_owner) > 0) {
        // This is an ownership takeover
        create_device_journal_entry("ownership_takeover", new_owner, "Device ownership transferred");
        
        // Create additional entry with takeover details
        cJSON *details = cJSON_CreateObject();
        cJSON_AddStringToObject(details, "action", "ownership_takeover_details");
        cJSON_AddStringToObject(details, "new_owner", new_owner);
        cJSON_AddStringToObject(details, "previous_owner", previous_owner);
        cJSON_AddNumberToObject(details, "timestamp", time(NULL));
        
        char *details_str = cJSON_PrintUnformatted(details);
        create_device_journal_entry("ownership_takeover_completed", new_owner, details_str);
        free(details_str);
        cJSON_Delete(details);
    } else {
        // This is a new ownership establishment
        create_device_journal_entry("ownership_established", new_owner, "Device claimed by new owner");
    }
}

// Log failed ownership attempts
void log_ownership_attempt_failed(const char *person_id, const char *reason) {
    char message[256];
    snprintf(message, sizeof(message), "Ownership attempt failed: %s", reason);
    create_device_journal_entry("ownership_attempt_failed", person_id, message);
}

// Log device state changes
void log_device_state_change(const char *state, const char *details) {
    create_device_journal_entry("device_state_changed", NULL, details);
}