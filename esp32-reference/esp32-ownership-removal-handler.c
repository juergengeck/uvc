/**
 * ESP32 Ownership Removal Handler
 * 
 * Handles ownership removal commands via service type 2 (CREDENTIALS)
 * since this service type is no longer used for credential provisioning
 * (we now use type 7 VC_EXCHANGE for that)
 */

#include "esp_log.h"
#include "nvs_flash.h"
#include "cJSON.h"
#include <string.h>
#include "driver/gpio.h"
#include <arpa/inet.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp32-service-types.h"

static const char *TAG = "OWNERSHIP_REMOVAL";

// Helper function to create verifiable device journal entries
void create_device_journal_entry(const char *action, const char *person_id, const char *message) {
    // Create a verifiable journal entry that can be synced to the app
    
    time_t now;
    time(&now);
    
    // Create journal entry as a verifiable credential
    cJSON *journal_vc = cJSON_CreateObject();
    
    // Standard VC fields
    cJSON_AddStringToObject(journal_vc, "$type$", "DeviceJournalCredential");
    cJSON_AddStringToObject(journal_vc, "id", generate_journal_entry_id());
    cJSON_AddStringToObject(journal_vc, "issuer", get_device_id()); // Device self-issues journal entries
    cJSON_AddStringToObject(journal_vc, "issuanceDate", get_iso_timestamp());
    
    // Credential subject contains the journal data
    cJSON *subject = cJSON_CreateObject();
    cJSON_AddStringToObject(subject, "id", get_device_id());
    cJSON_AddStringToObject(subject, "action", action);
    cJSON_AddStringToObject(subject, "actor", person_id ? person_id : "system");
    cJSON_AddStringToObject(subject, "message", message);
    cJSON_AddNumberToObject(subject, "timestamp", (double)now);
    cJSON_AddStringToObject(subject, "deviceType", "ESP32");
    
    // Add device state at time of event
    cJSON *device_state = cJSON_CreateObject();
    cJSON_AddBoolToObject(device_state, "owned", device_owned);
    cJSON_AddStringToObject(device_state, "owner", device_owned ? owner_person_id : "none");
    cJSON_AddItemToObject(subject, "deviceState", device_state);
    
    cJSON_AddItemToObject(journal_vc, "credentialSubject", subject);
    
    // Create proof (in real implementation, would sign with device's private key)
    cJSON *proof = cJSON_CreateObject();
    cJSON_AddStringToObject(proof, "type", "Ed25519Signature2020");
    cJSON_AddStringToObject(proof, "created", get_iso_timestamp());
    cJSON_AddStringToObject(proof, "verificationMethod", get_device_key_id());
    
    // In production: Calculate signature over canonicalized JSON
    // For now, create a placeholder
    char signature[128];
    snprintf(signature, sizeof(signature), "placeholder_%s_%ld", action, now);
    cJSON_AddStringToObject(proof, "proofValue", signature);
    
    cJSON_AddItemToObject(journal_vc, "proof", proof);
    
    // Store in NVS as rotating journal entries
    store_journal_entry(journal_vc);
    
    // Log for debugging
    char *vc_string = cJSON_PrintUnformatted(journal_vc);
    ESP_LOGI(TAG, "[JOURNAL_VC] Created verifiable journal entry: %s", vc_string);
    free(vc_string);
    
    cJSON_Delete(journal_vc);
}

// Store journal entry in NVS with rotation
void store_journal_entry(cJSON *journal_vc) {
    // Get current journal index
    uint32_t journal_index = 0;
    size_t index_size = sizeof(journal_index);
    nvs_get_u32(nvs_handle, "journal_idx", &journal_index);
    
    // Store the journal entry
    char key[16];
    snprintf(key, sizeof(key), "journal_%d", journal_index % MAX_JOURNAL_ENTRIES);
    
    char *vc_string = cJSON_PrintUnformatted(journal_vc);
    if (vc_string) {
        esp_err_t err = nvs_set_blob(nvs_handle, key, vc_string, strlen(vc_string) + 1);
        if (err == ESP_OK) {
            // Update index
            journal_index++;
            nvs_set_u32(nvs_handle, "journal_idx", journal_index);
            nvs_commit(nvs_handle);
            
            ESP_LOGI(TAG, "Stored journal entry at index %d", (journal_index - 1) % MAX_JOURNAL_ENTRIES);
        } else {
            ESP_LOGE(TAG, "Failed to store journal entry: %s", esp_err_to_name(err));
        }
        free(vc_string);
    }
}

// Generate unique journal entry ID
char* generate_journal_entry_id() {
    static char id[64];
    snprintf(id, sizeof(id), "journal-%s-%ld-%04x", 
             get_device_id(), time(NULL), esp_random() & 0xFFFF);
    return id;
}

// Get ISO timestamp
char* get_iso_timestamp() {
    static char timestamp[32];
    time_t now;
    time(&now);
    struct tm *timeinfo = gmtime(&now);
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", timeinfo);
    return timestamp;
}

// Get device key ID for verification
char* get_device_key_id() {
    static char key_id[128];
    snprintf(key_id, sizeof(key_id), "did:esp32:%s#key-1", get_device_id());
    return key_id;
}

#define MAX_JOURNAL_ENTRIES 100  // Keep last 100 journal entries

// Handler for service type 2 (CREDENTIALS) messages
void handle_credentials_service_message(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    ESP_LOGI(TAG, "Received credentials service message from %s:%d (len=%d)", 
             inet_ntoa(source->sin_addr), ntohs(source->sin_port), len);
    
    // Skip service type byte
    if (len < 2) {
        ESP_LOGW(TAG, "Message too short");
        return;
    }
    
    // Parse JSON message
    const char *json_str = (const char*)(data + 1);
    cJSON *json = cJSON_Parse(json_str);
    if (!json) {
        ESP_LOGE(TAG, "Failed to parse JSON");
        return;
    }
    
    // Get message type
    cJSON *type_item = cJSON_GetObjectItem(json, "type");
    if (!type_item || !cJSON_IsString(type_item)) {
        ESP_LOGW(TAG, "No type field in message");
        cJSON_Delete(json);
        return;
    }
    
    const char *type = type_item->valuestring;
    ESP_LOGI(TAG, "Message type: %s", type);
    
    // Handle ownership removal
    if (strcmp(type, "ownership_remove") == 0) {
        handle_ownership_removal(json, source);
    } else {
        ESP_LOGW(TAG, "Unknown message type: %s", type);
    }
    
    cJSON_Delete(json);
}

// Handle ownership removal command
void handle_ownership_removal(cJSON *json, struct sockaddr_in *source) {
    ESP_LOGI(TAG, "Processing ownership removal request");
    
    // Get device ID
    cJSON *device_id_item = cJSON_GetObjectItem(json, "deviceId");
    if (!device_id_item || !cJSON_IsString(device_id_item)) {
        ESP_LOGW(TAG, "No deviceId in removal request");
        return;
    }
    
    const char *device_id = device_id_item->valuestring;
    
    // Verify this is for our device
    if (strcmp(device_id, get_device_id()) != 0) {
        ESP_LOGW(TAG, "Removal request for different device: %s", device_id);
        return;
    }
    
    // Get sender person ID
    cJSON *sender_id_item = cJSON_GetObjectItem(json, "senderPersonId");
    if (!sender_id_item || !cJSON_IsString(sender_id_item)) {
        ESP_LOGW(TAG, "No senderPersonId in removal request");
        return;
    }
    
    const char *sender_id = sender_id_item->valuestring;
    
    // Check if sender is the current owner
    char stored_owner[65] = {0};
    size_t owner_len = sizeof(stored_owner);
    esp_err_t err = nvs_get_str(nvs_handle, "owner_id", stored_owner, &owner_len);
    
    if (err != ESP_OK || strlen(stored_owner) == 0) {
        ESP_LOGW(TAG, "Device has no owner, ignoring removal request");
        return;
    }
    
    if (strcmp(sender_id, stored_owner) != 0) {
        ESP_LOGW(TAG, "Removal request from non-owner: %s (owner is %s)", sender_id, stored_owner);
        return;
    }
    
    ESP_LOGI(TAG, "Ownership removal authorized by owner %s", sender_id);
    
    // Log removal start
    create_device_journal_entry("ownership_removal_started", sender_id, "Processing removal request");
    
    // Clear ownership data from NVS
    err = nvs_erase_key(nvs_handle, "device_vc");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to erase device_vc: %s", esp_err_to_name(err));
    }
    
    err = nvs_erase_key(nvs_handle, "owner_id");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to erase owner_id: %s", esp_err_to_name(err));
    }
    
    // Clear runtime state
    device_owned = false;
    memset(owner_person_id, 0, sizeof(owner_person_id));
    memset(&stored_credential, 0, sizeof(stored_credential));
    
    // Commit changes
    err = nvs_commit(nvs_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to commit NVS changes: %s", esp_err_to_name(err));
    }
    
    ESP_LOGI(TAG, "Device ownership removed successfully");
    
    // Log successful removal
    create_device_journal_entry("ownership_removed", sender_id, "Device is now unclaimed");
    
    // Update display
    update_ownership_display(false, NULL);
    
    // Restart discovery broadcasts (device is now unclaimed)
    start_discovery_broadcast();
    
    // Optional: Send acknowledgment back to the app
    send_ownership_removal_ack(source);
    
    // Optional: Restart device after a delay to ensure clean state
    ESP_LOGI(TAG, "Device will restart in 3 seconds...");
    vTaskDelay(3000 / portTICK_PERIOD_MS);
    esp_restart();
}

// Send acknowledgment of ownership removal
void send_ownership_removal_ack(struct sockaddr_in *dest) {
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "ownership_removal_ack");
    cJSON_AddStringToObject(response, "device_id", get_device_id());
    cJSON_AddStringToObject(response, "status", "removed");
    cJSON_AddStringToObject(response, "message", "Ownership removed successfully");
    
    char *response_str = cJSON_PrintUnformatted(response);
    if (response_str) {
        // Create packet with service type 2
        size_t msg_len = strlen(response_str);
        uint8_t *packet = malloc(msg_len + 2); // +1 for service type, +1 for null terminator
        
        if (packet) {
            packet[0] = SERVICE_TYPE_CREDENTIALS; // Service type 2
            memcpy(packet + 1, response_str, msg_len + 1);
            
            // Send response
            int sent = sendto(udp_socket, packet, msg_len + 2, 0,
                            (struct sockaddr*)dest, sizeof(struct sockaddr_in));
                            
            if (sent < 0) {
                ESP_LOGE(TAG, "Failed to send removal ack: %s", strerror(errno));
            } else {
                ESP_LOGI(TAG, "Sent ownership removal acknowledgment");
            }
            
            free(packet);
        }
        
        free(response_str);
    }
    
    cJSON_Delete(response);
}

// Update the main message router to handle service type 2
void process_udp_message(uint8_t *data, size_t len, struct sockaddr_in *source) {
    if (len < 1) return;
    
    uint8_t service_type = data[0];
    ESP_LOGI(TAG, "Received service type %d from %s:%d", 
             service_type, inet_ntoa(source->sin_addr), ntohs(source->sin_port));
    
    switch (service_type) {
        case 1: // DISCOVERY
            if (!device_owned) {
                handle_discovery_message(data, len, source);
            }
            break;
            
        case 2: // CREDENTIALS (now used for ownership removal)
            handle_credentials_service_message(data, len, source);
            break;
            
        case 3: // LED_CONTROL
            if (device_owned) {
                handle_led_control_message(data, len, source);
            }
            break;
            
        case 6: // ATTESTATION (reserved for true cryptographic attestations)
            // Reserved for future attestation handling
            ESP_LOGW(TAG, "Service type 6 (attestation) not yet implemented");
            break;
            
        case 7: // VC_EXCHANGE
            handle_vc_exchange_message(data, len, source);
            break;
            
        default:
            ESP_LOGW(TAG, "Unknown service type: %d", service_type);
            break;
    }
}

void handle_led_control_message(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    ESP_LOGI(TAG, "Received LED control message from %s:%d (len=%d)", 
             inet_ntoa(source->sin_addr), ntohs(source->sin_port), len);
    
    // Skip service type byte
    if (len < 2) {
        ESP_LOGW(TAG, "Message too short");
        return;
    }
    
    // Parse JSON message
    const char *json_str = (const char*)(data + 1);
    cJSON *json = cJSON_Parse(json_str);
    if (!json) {
        ESP_LOGE(TAG, "Failed to parse JSON");
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "Invalid JSON");
        send_json_response(response, source, 3); // SERVICE_LED_CONTROL
        cJSON_Delete(response);
        return;
    }
    
    // Get command from the JSON
    cJSON *command_item = cJSON_GetObjectItem(json, "command");
    if (!command_item || !cJSON_IsObject(command_item)) {
        ESP_LOGE(TAG, "No command object in LED control message");
        cJSON_Delete(json);
        
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "No command object");
        send_json_response(response, source, 3);
        cJSON_Delete(response);
        return;
    }
    
    // Get the action from command
    cJSON *action_item = cJSON_GetObjectItem(command_item, "action");
    if (!action_item || !cJSON_IsString(action_item)) {
        ESP_LOGE(TAG, "No action in LED command");
        cJSON_Delete(json);
        
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "No action specified");
        send_json_response(response, source, 3);
        cJSON_Delete(response);
        return;
    }
    
    const char *action = cJSON_GetStringValue(action_item);
    ESP_LOGI(TAG, "LED action: %s", action);
    
    // Control the LED based on action
    if (strcmp(action, "on") == 0) {
        gpio_set_level(GPIO_NUM_2, 1);  // Turn LED ON
        ESP_LOGI(TAG, "LED turned ON");
    } else if (strcmp(action, "off") == 0) {
        gpio_set_level(GPIO_NUM_2, 0);  // Turn LED OFF
        ESP_LOGI(TAG, "LED turned OFF");
    } else if (strcmp(action, "toggle") == 0) {
        int current_level = gpio_get_level(GPIO_NUM_2);
        gpio_set_level(GPIO_NUM_2, !current_level);  // Toggle LED
        ESP_LOGI(TAG, "LED toggled to %s", !current_level ? "ON" : "OFF");
    } else if (strcmp(action, "blink") == 0) {
        // Get duration if provided
        cJSON *duration_item = cJSON_GetObjectItem(command_item, "duration");
        int duration = duration_item && cJSON_IsNumber(duration_item) ? 
                      cJSON_GetNumberValue(duration_item) : 1000;
        
        // Blink the LED
        gpio_set_level(GPIO_NUM_2, 1);
        vTaskDelay(duration / 2 / portTICK_PERIOD_MS);
        gpio_set_level(GPIO_NUM_2, 0);
        vTaskDelay(duration / 2 / portTICK_PERIOD_MS);
        ESP_LOGI(TAG, "LED blinked for %d ms", duration);
    } else {
        ESP_LOGW(TAG, "Unknown LED action: %s", action);
        cJSON_Delete(json);
        
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "Unknown action");
        send_json_response(response, source, 3);
        cJSON_Delete(response);
        return;
    }
    
    // Send success response
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "led_status");
    cJSON_AddStringToObject(response, "status", "ok");
    cJSON_AddStringToObject(response, "action", action);
    cJSON_AddBoolToObject(response, "success", true);
    
    // Get requestId if present and include it in response
    cJSON *request_id = cJSON_GetObjectItem(json, "requestId");
    if (request_id && cJSON_IsString(request_id)) {
        cJSON_AddStringToObject(response, "requestId", cJSON_GetStringValue(request_id));
    }
    
    send_json_response(response, source, 3); // SERVICE_LED_CONTROL
    cJSON_Delete(response);
    cJSON_Delete(json);
}