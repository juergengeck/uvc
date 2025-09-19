// ESP32 Ownership Provisioning Fix
// Complete implementation for handling credential provisioning and ownership

#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "lwip/sockets.h"
#include "cJSON.h"
#include <string.h>
#include <arpa/inet.h>
#include "esp_timer.h"
#include "esp_system.h"
#include "esp_wifi.h"

#define TAG "ESP32-Ownership"

// Service type definitions
#define SERVICE_DISCOVERY    0x01  // HTML-based discovery broadcasts
#define SERVICE_CREDENTIALS  0x02  // Credential provisioning
#define SERVICE_LED_CONTROL  0x03  // LED control commands
#define SERVICE_ESP32_DATA   0x04  // ESP32 data messages
#define SERVICE_JOURNAL_SYNC 0x05  // Journal synchronization
#define SERVICE_ATTESTATION  0x06  // Reserved for true cryptographic attestations
#define SERVICE_VC_EXCHANGE  0x07  // Verifiable Credential exchange

// Global variables (defined elsewhere in your main file)
extern int service_socket;
extern char device_id[32];  // MAC-based device ID
extern bool blue_led_state;
extern bool manual_control;

// Port configuration
#define UNIFIED_SERVICE_PORT 49497

// Initialize NVS for storing ownership data
esp_err_t init_ownership_storage(void) {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    return ret;
}

// Check if device is owned
bool is_device_owned(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_cred", NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return false;
    }
    
    char owner_id[65] = {0};
    size_t owner_len = sizeof(owner_id);
    err = nvs_get_str(nvs_handle, "owner_id", owner_id, &owner_len);
    nvs_close(nvs_handle);
    
    return (err == ESP_OK && strlen(owner_id) > 0);
}

// Get stored owner ID
esp_err_t get_owner_id(char *owner_id, size_t max_len) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_cred", NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return err;
    }
    
    size_t owner_len = max_len;
    err = nvs_get_str(nvs_handle, "owner_id", owner_id, &owner_len);
    nvs_close(nvs_handle);
    
    return err;
}

// Store ownership credential
esp_err_t store_ownership_credential(const char *owner_id, const char *credential_json) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_cred", NVS_READWRITE, &nvs_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS for writing: %s", esp_err_to_name(err));
        return err;
    }
    
    // Store owner ID (full 64 characters for SHA256 hash)
    err = nvs_set_str(nvs_handle, "owner_id", owner_id);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to store owner_id: %s", esp_err_to_name(err));
        nvs_close(nvs_handle);
        return err;
    }
    
    // Store the credential JSON
    err = nvs_set_str(nvs_handle, "device_vc", credential_json);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to store credential: %s", esp_err_to_name(err));
        nvs_close(nvs_handle);
        return err;
    }
    
    // Commit the changes
    err = nvs_commit(nvs_handle);
    nvs_close(nvs_handle);
    
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "✅ Ownership credential stored successfully");
        ESP_LOGI(TAG, "Owner ID: %.64s", owner_id);  // Log full 64 chars
    }
    
    return err;
}

// Clear ownership (for ownership removal)
esp_err_t clear_ownership(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_cred", NVS_READWRITE, &nvs_handle);
    if (err != ESP_OK) {
        return err;
    }
    
    nvs_erase_key(nvs_handle, "owner_id");
    nvs_erase_key(nvs_handle, "device_vc");
    err = nvs_commit(nvs_handle);
    nvs_close(nvs_handle);
    
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "✅ Ownership cleared - device is now unclaimed");
    }
    
    return err;
}

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
            ESP_LOGE(TAG, "Invalid or missing issuer (owner ID)");
            cJSON_Delete(root);
            return;
        }
        
        // Check if already owned
        if (is_device_owned()) {
            char current_owner[65] = {0};
            get_owner_id(current_owner, sizeof(current_owner));
            ESP_LOGW(TAG, "Device already owned by: %.16s...", current_owner);
            
            // Send rejection response
            send_provisioning_response(sender_ip, sender_port, false, "already_owned");
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
                
                // Send success response
                send_provisioning_response(sender_ip, sender_port, true, "provisioned");
            } else {
                ESP_LOGE(TAG, "Failed to store credential: %s", esp_err_to_name(err));
                send_provisioning_response(sender_ip, sender_port, false, "storage_error");
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
                    send_provisioning_response(sender_ip, sender_port, true, "ownership_removed");
                    
                    // Restart after 3 seconds to ensure clean state
                    vTaskDelay(pdMS_TO_TICKS(3000));
                    esp_restart();
                }
            } else {
                ESP_LOGW(TAG, "Unauthorized removal attempt from: %.16s...", sender_person_id);
                send_provisioning_response(sender_ip, sender_port, false, "unauthorized");
            }
        } else {
            ESP_LOGW(TAG, "Device not owned, cannot remove ownership");
            send_provisioning_response(sender_ip, sender_port, false, "not_owned");
        }
    }
    
    cJSON_Delete(root);
}

// Send provisioning response
esp_err_t send_provisioning_response(const char *target_ip, int target_port, bool success, const char *status) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Create response
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "provisioning_ack");
    cJSON_AddStringToObject(root, "deviceId", device_id);
    cJSON_AddBoolToObject(root, "success", success);
    cJSON_AddStringToObject(root, "status", status);
    cJSON_AddNumberToObject(root, "timestamp", esp_timer_get_time() / 1000);
    
    char *json_str = cJSON_PrintUnformatted(root);
    if (!json_str) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }
    
    // Create packet with ESP32_RESPONSE_SERVICE type (11)
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    packet[0] = 11;  // ESP32_RESPONSE_SERVICE
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
    
    ESP_LOGI(TAG, "📤 Provisioning response sent: %s", status);
    return ESP_OK;
}

// Send discovery broadcast with proper ownership status (Service Type 6)
esp_err_t send_discovery_broadcast(void) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Check ownership status
    char owner_id[65] = {0};
    bool is_owned = false;
    
    if (get_owner_id(owner_id, sizeof(owner_id)) == ESP_OK && strlen(owner_id) > 0) {
        is_owned = true;
    }
    
    // Create HTML discovery message (compact format)
    char html_buffer[512];
    int html_len;
    
    if (is_owned) {
        // Owned device includes owner ID
        html_len = snprintf(html_buffer, sizeof(html_buffer),
            "<!DOCTYPE html>"
            "<html itemscope itemtype=\"https://refinio.one/DevicePresence\">"
            "<meta itemprop=\"$type$\" content=\"DevicePresence\">"
            "<meta itemprop=\"id\" content=\"%s\">"
            "<meta itemprop=\"type\" content=\"ESP32\">"
            "<meta itemprop=\"status\" content=\"online\">"
            "<meta itemprop=\"ownership\" content=\"claimed\">"
            "<meta itemprop=\"owner\" content=\"%.64s\">"  // Full 64 char owner ID
            "</html>",
            device_id, owner_id);
    } else {
        // Unclaimed device
        html_len = snprintf(html_buffer, sizeof(html_buffer),
            "<!DOCTYPE html>"
            "<html itemscope itemtype=\"https://refinio.one/DevicePresence\">"
            "<meta itemprop=\"$type$\" content=\"DevicePresence\">"
            "<meta itemprop=\"id\" content=\"%s\">"
            "<meta itemprop=\"type\" content=\"ESP32\">"
            "<meta itemprop=\"status\" content=\"online\">"
            "<meta itemprop=\"ownership\" content=\"unclaimed\">"
            "</html>",
            device_id);
    }
    
    // Create packet with ATTESTATION service type (6)
    uint8_t *packet = malloc(html_len + 1);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet buffer");
        return ESP_FAIL;
    }
    
    packet[0] = SERVICE_DISCOVERY;  // Service type 1 for discovery
    memcpy(packet + 1, html_buffer, html_len);
    
    // Send broadcast
    struct sockaddr_in broadcast_addr;
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_addr.s_addr = htonl(INADDR_BROADCAST);
    broadcast_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
    
    ssize_t sent = sendto(service_socket, packet, html_len + 1, 0,
                         (struct sockaddr *)&broadcast_addr, sizeof(broadcast_addr));
    
    free(packet);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send discovery broadcast: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📡 Discovery sent (%s, %d bytes)", 
             is_owned ? "claimed" : "unclaimed", (int)sent);
    
    return ESP_OK;
}

// Handle VC exchange messages (Service Type 7)
void handle_vc_exchange(const uint8_t *data, size_t len, const char *sender_ip, int sender_port) {
    ESP_LOGI(TAG, "📥 Received VC exchange from %s:%d (%d bytes)", sender_ip, sender_port, (int)len);
    
    // Skip service type byte
    if (len < 2) {
        ESP_LOGE(TAG, "VC message too short");
        return;
    }
    
    // Parse JSON message
    cJSON *root = cJSON_ParseWithLength((const char *)(data + 1), len - 1);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse VC JSON");
        return;
    }
    
    const char *type = cJSON_GetStringValue(cJSON_GetObjectItem(root, "type"));
    if (!type) {
        ESP_LOGE(TAG, "No type in VC message");
        cJSON_Delete(root);
        return;
    }
    
    ESP_LOGI(TAG, "VC message type: %s", type);
    
    if (strcmp(type, "request_vc") == 0) {
        // App is requesting our credential
        handle_vc_request(sender_ip, sender_port, root);
    } else if (strcmp(type, "present_vc") == 0) {
        // Check if this is a provisioning attempt
        const char *purpose = cJSON_GetStringValue(cJSON_GetObjectItem(root, "purpose"));
        if (purpose && strcmp(purpose, "device_provisioning") == 0) {
            ESP_LOGI(TAG, "Received provisioning VC via Type 7");
            
            // Extract the credential
            cJSON *vc = cJSON_GetObjectItem(root, "vc");
            if (vc) {
                // Convert to provision_device format for reuse
                cJSON *provision_msg = cJSON_CreateObject();
                cJSON_AddStringToObject(provision_msg, "type", "provision_device");
                cJSON_AddItemReferenceToObject(provision_msg, "credential", vc);
                
                char *provision_str = cJSON_PrintUnformatted(provision_msg);
                if (provision_str) {
                    // Process as credential provisioning
                    size_t msg_len = strlen(provision_str);
                    uint8_t *fake_data = malloc(msg_len + 1);
                    fake_data[0] = SERVICE_CREDENTIALS;
                    memcpy(fake_data + 1, provision_str, msg_len);
                    
                    handle_credential_provisioning(fake_data, msg_len + 1, sender_ip, sender_port);
                    
                    free(fake_data);
                    free(provision_str);
                }
                cJSON_Delete(provision_msg);
            }
        }
    }
    
    cJSON_Delete(root);
}

// Handle VC request - send our stored credential
void handle_vc_request(const char *sender_ip, int sender_port, cJSON *request) {
    ESP_LOGI(TAG, "Handling VC request from %s:%d", sender_ip, sender_port);
    
    // Check if we have a stored credential
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_cred", NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "No credentials stored - device is unclaimed");
        send_vc_unclaimed_response(sender_ip, sender_port);
        return;
    }
    
    // Get stored credential
    size_t vc_len = 2048;
    char *vc_json = malloc(vc_len);
    err = nvs_get_str(nvs_handle, "device_vc", vc_json, &vc_len);
    nvs_close(nvs_handle);
    
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Failed to retrieve stored credential");
        free(vc_json);
        send_vc_unclaimed_response(sender_ip, sender_port);
        return;
    }
    
    // Parse stored credential
    cJSON *vc = cJSON_Parse(vc_json);
    free(vc_json);
    
    if (!vc) {
        ESP_LOGE(TAG, "Failed to parse stored credential");
        send_vc_unclaimed_response(sender_ip, sender_port);
        return;
    }
    
    // Create VC response
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "present_vc");
    cJSON_AddStringToObject(response, "device_id", device_id);
    cJSON_AddItemToObject(response, "vc", vc);  // Takes ownership of vc
    
    // Get nonce from request if present
    const char *nonce = cJSON_GetStringValue(cJSON_GetObjectItem(request, "nonce"));
    if (nonce) {
        cJSON_AddStringToObject(response, "nonce", nonce);
    }
    
    // Send response
    char *response_str = cJSON_PrintUnformatted(response);
    if (response_str) {
        size_t response_len = strlen(response_str);
        uint8_t *packet = malloc(response_len + 1);
        packet[0] = SERVICE_VC_EXCHANGE;  // Type 7
        memcpy(packet + 1, response_str, response_len);
        
        struct sockaddr_in target_addr;
        memset(&target_addr, 0, sizeof(target_addr));
        target_addr.sin_family = AF_INET;
        target_addr.sin_port = htons(sender_port);
        inet_pton(AF_INET, sender_ip, &target_addr.sin_addr);
        
        sendto(service_socket, packet, response_len + 1, 0,
               (struct sockaddr *)&target_addr, sizeof(target_addr));
        
        ESP_LOGI(TAG, "📤 VC response sent with stored credential");
        
        free(packet);
        free(response_str);
    }
    
    cJSON_Delete(response);
}

// Send unclaimed response for VC request
void send_vc_unclaimed_response(const char *sender_ip, int sender_port) {
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "device_unclaimed");
    cJSON_AddStringToObject(response, "device_id", device_id);
    cJSON_AddStringToObject(response, "message", "Device is not provisioned");
    
    char *response_str = cJSON_PrintUnformatted(response);
    if (response_str) {
        size_t response_len = strlen(response_str);
        uint8_t *packet = malloc(response_len + 1);
        packet[0] = SERVICE_VC_EXCHANGE;  // Type 7
        memcpy(packet + 1, response_str, response_len);
        
        struct sockaddr_in target_addr;
        memset(&target_addr, 0, sizeof(target_addr));
        target_addr.sin_family = AF_INET;
        target_addr.sin_port = htons(sender_port);
        inet_pton(AF_INET, sender_ip, &target_addr.sin_addr);
        
        sendto(service_socket, packet, response_len + 1, 0,
               (struct sockaddr *)&target_addr, sizeof(target_addr));
        
        ESP_LOGI(TAG, "📤 Sent unclaimed device response");
        
        free(packet);
        free(response_str);
    }
    
    cJSON_Delete(response);
}

// Main service message handler - add to your unified_service_task
void handle_service_message(const uint8_t *data, size_t len, const char *sender_ip, int sender_port) {
    if (len < 1) {
        ESP_LOGE(TAG, "Message too short");
        return;
    }
    
    uint8_t service_type = data[0];
    ESP_LOGI(TAG, "Received service type %d from %s:%d", service_type, sender_ip, sender_port);
    
    switch (service_type) {
        case SERVICE_DISCOVERY:
            // Handle discovery request - send our status back
            send_discovery_broadcast();
            break;
            
        case SERVICE_CREDENTIALS:
            handle_credential_provisioning(data, len, sender_ip, sender_port);
            break;
            
        case SERVICE_LED_CONTROL:
            handle_led_control(data, len, sender_ip, sender_port);
            break;
            
        case SERVICE_VC_EXCHANGE:
            handle_vc_exchange(data, len, sender_ip, sender_port);
            break;
            
        case SERVICE_DISCOVERY:  // Handle discovery on type 1
            // We receive discovery from other devices, could maintain peer registry
            ESP_LOGI(TAG, "Received attestation from peer device");
            break;
            
        default:
            ESP_LOGW(TAG, "Unknown service type: %d", service_type);
            break;
    }
}

// LED control with ownership check
void handle_led_control(const uint8_t *data, size_t len, const char *sender_ip, int sender_port) {
    ESP_LOGI(TAG, "LED control request from %s:%d", sender_ip, sender_port);
    
    // Parse the command
    cJSON *root = cJSON_ParseWithLength((const char *)(data + 1), len - 1);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse LED command");
        return;
    }
    
    // Check sender authorization
    const char *sender_person_id = cJSON_GetStringValue(cJSON_GetObjectItem(root, "senderPersonId"));
    if (!sender_person_id) {
        ESP_LOGW(TAG, "No senderPersonId in LED command");
        cJSON_Delete(root);
        return;
    }
    
    // Verify sender is the owner
    char owner_id[65] = {0};
    if (get_owner_id(owner_id, sizeof(owner_id)) != ESP_OK) {
        ESP_LOGW(TAG, "Device not owned - LED control denied");
        send_led_response(sender_ip, sender_port, false, "not_owned");
        cJSON_Delete(root);
        return;
    }
    
    if (strcmp(owner_id, sender_person_id) != 0) {
        ESP_LOGW(TAG, "Unauthorized LED control from: %.16s...", sender_person_id);
        send_led_response(sender_ip, sender_port, false, "unauthorized");
        cJSON_Delete(root);
        return;
    }
    
    // Process the LED command
    cJSON *command_obj = cJSON_GetObjectItem(root, "command");
    if (command_obj) {
        const char *command = cJSON_GetStringValue(cJSON_GetObjectItem(command_obj, "command"));
        if (command) {
            if (strcmp(command, "blue_on") == 0) {
                blue_led_state = true;
                manual_control = true;
                gpio_set_level(BLUE_LED_GPIO, 1);
                ESP_LOGI(TAG, "💡 Blue LED ON");
            } else if (strcmp(command, "blue_off") == 0) {
                blue_led_state = false;
                manual_control = true;
                gpio_set_level(BLUE_LED_GPIO, 0);
                ESP_LOGI(TAG, "💡 Blue LED OFF");
            } else if (strcmp(command, "blue_auto") == 0) {
                manual_control = false;
                ESP_LOGI(TAG, "💡 Blue LED AUTO mode");
            }
            
            send_led_response(sender_ip, sender_port, true, command);
        }
    }
    
    cJSON_Delete(root);
}

// Send LED control response
esp_err_t send_led_response(const char *target_ip, int target_port, bool success, const char *status) {
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "led_status");
    cJSON_AddBoolToObject(response, "success", success);
    cJSON_AddStringToObject(response, "status", status);
    cJSON_AddStringToObject(response, "blue_led", blue_led_state ? "on" : "off");
    cJSON_AddBoolToObject(response, "manual_control", manual_control);
    cJSON_AddStringToObject(response, "device_id", device_id);
    
    char *json_str = cJSON_PrintUnformatted(response);
    if (!json_str) {
        cJSON_Delete(response);
        return ESP_FAIL;
    }
    
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    packet[0] = SERVICE_LED_CONTROL;  // Type 3
    memcpy(packet + 1, json_str, json_len);
    
    struct sockaddr_in target_addr;
    memset(&target_addr, 0, sizeof(target_addr));
    target_addr.sin_family = AF_INET;
    target_addr.sin_port = htons(target_port);
    inet_pton(AF_INET, target_ip, &target_addr.sin_addr);
    
    sendto(service_socket, packet, json_len + 1, 0,
           (struct sockaddr *)&target_addr, sizeof(target_addr));
    
    free(packet);
    cJSON_Delete(response);
    free(json_str);
    
    return ESP_OK;
}

// Main initialization function to call from app_main
void init_ownership_system(void) {
    // Initialize NVS
    ESP_ERROR_CHECK(init_ownership_storage());
    
    // Check and log ownership status
    if (is_device_owned()) {
        char owner_id[65] = {0};
        get_owner_id(owner_id, sizeof(owner_id));
        ESP_LOGI(TAG, "🔒 Device is OWNED by: %.64s", owner_id);
    } else {
        ESP_LOGI(TAG, "🔓 Device is UNCLAIMED - ready for provisioning");
    }
}

// Discovery task - periodic broadcasts
void discovery_task(void *pvParameters) {
    while (1) {
        // Send discovery broadcast
        send_discovery_broadcast();
        
        // Different intervals based on ownership
        if (is_device_owned()) {
            // Owned devices: slower heartbeat (30 seconds)
            vTaskDelay(pdMS_TO_TICKS(30000));
        } else {
            // Unclaimed devices: faster discovery (5 seconds)
            vTaskDelay(pdMS_TO_TICKS(5000));
        }
    }
}

// Notes for integration:
// 1. Add these includes to your main file
// 2. Call init_ownership_system() in app_main after WiFi is connected
// 3. Replace your existing send_discovery_broadcast with this version
// 4. Add handle_service_message to your UDP receive loop
// 5. Create the discovery_task with xTaskCreate
// 6. Define BLUE_LED_GPIO for your LED pin
// 7. Ensure device_id is set from MAC address