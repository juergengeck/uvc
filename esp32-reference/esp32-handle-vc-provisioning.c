// ESP32 VC Provisioning Handler Fix
// Add this to one.core/src/system/esp32/esp32-quicvc-project/main/main.c

// In handle_vc_exchange_message function, add handling for present_vc:

void handle_vc_exchange_message(const char *payload, size_t len, 
                                const char *sender_ip, uint16_t sender_port) {
    ESP_LOGI(TAG, "📥 VC Exchange from %s:%d", sender_ip, sender_port);
    
    cJSON *root = cJSON_Parse(payload);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse VC JSON");
        return;
    }
    
    const char *type = cJSON_GetStringValue(cJSON_GetObjectItem(root, "type"));
    if (!type) {
        cJSON_Delete(root);
        return;
    }
    
    // Handle different VC exchange message types
    if (strcmp(type, "vc_request") == 0) {
        // Existing code to handle VC request...
        // Send back vc_response with device status
        
    } else if (strcmp(type, "present_vc") == 0) {
        // NEW: Handle ownership provisioning via VC presentation
        ESP_LOGI(TAG, "✨ Received VC presentation for provisioning");
        
        // Check purpose
        const char *purpose = cJSON_GetStringValue(cJSON_GetObjectItem(root, "purpose"));
        if (purpose && strcmp(purpose, "device_provisioning") == 0) {
            // This is a provisioning credential
            cJSON *vc = cJSON_GetObjectItem(root, "vc");
            if (!vc) {
                ESP_LOGE(TAG, "No VC in presentation");
                cJSON_Delete(root);
                return;
            }
            
            // Extract issuer (owner) from the VC
            const char *issuer = cJSON_GetStringValue(cJSON_GetObjectItem(vc, "issuer"));
            if (!issuer || strlen(issuer) != 64) {
                ESP_LOGE(TAG, "Invalid issuer in VC: %s", issuer ? issuer : "null");
                cJSON_Delete(root);
                return;
            }
            
            // Check if already owned
            if (has_owner()) {
                ESP_LOGW(TAG, "Device already owned, rejecting new provisioning");
                // TODO: Send rejection response
                cJSON_Delete(root);
                return;
            }
            
            // Store the credential in NVS
            ESP_LOGI(TAG, "🔒 Storing ownership credential from: %.16s...", issuer);
            
            nvs_handle_t nvs_handle;
            esp_err_t err = nvs_open("device_cred", NVS_READWRITE, &nvs_handle);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to open NVS: %s", esp_err_to_name(err));
                cJSON_Delete(root);
                return;
            }
            
            // Store owner ID (issuer)
            err = nvs_set_str(nvs_handle, "owner_id", issuer);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to store owner ID: %s", esp_err_to_name(err));
                nvs_close(nvs_handle);
                cJSON_Delete(root);
                return;
            }
            
            // Store full credential as JSON string
            char *vc_str = cJSON_PrintUnformatted(vc);
            if (vc_str) {
                err = nvs_set_blob(nvs_handle, "credential", vc_str, strlen(vc_str) + 1);
                free(vc_str);
                
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to store credential: %s", esp_err_to_name(err));
                }
            }
            
            // Set ownership flag
            uint8_t owned = 1;
            err = nvs_set_u8(nvs_handle, "is_owned", owned);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to set ownership flag: %s", esp_err_to_name(err));
            }
            
            // Commit changes
            err = nvs_commit(nvs_handle);
            nvs_close(nvs_handle);
            
            if (err == ESP_OK) {
                ESP_LOGI(TAG, "✅ Device successfully provisioned by: %.16s...", issuer);
                
                // Update attestation system
                attestation_set_ownership(true, issuer);
                
                // Clear ownership cache to force reload
                cached_ownership_checked = false;
                
                // Store owner's address for heartbeats
                strncpy(owner_last_address, sender_ip, sizeof(owner_last_address) - 1);
                owner_last_port = sender_port;
                owner_address_known = true;
                
                ESP_LOGI(TAG, "🔇 Entering SILENT MODE - discovery broadcasts disabled");
                ESP_LOGI(TAG, "💓 Will send heartbeats to owner at %s:%d", 
                        owner_last_address, owner_last_port);
                
                // TODO: Send provisioning acknowledgment back to owner
                // send_provisioning_ack(sender_ip, sender_port);
            } else {
                ESP_LOGE(TAG, "Failed to commit credential to NVS");
            }
        }
    }
    
    cJSON_Delete(root);
}

// Update has_owner() function to check NVS:
bool has_owner(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_cred", NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return false;
    }
    
    uint8_t is_owned = 0;
    err = nvs_get_u8(nvs_handle, "is_owned", &is_owned);
    nvs_close(nvs_handle);
    
    return (err == ESP_OK && is_owned == 1);
}

// Update get_cached_owner_id() to read from NVS:
const char* get_cached_owner_id(void) {
    static char owner_id[65] = {0};
    
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_cred", NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return "";
    }
    
    size_t length = sizeof(owner_id);
    err = nvs_get_str(nvs_handle, "owner_id", owner_id, &length);
    nvs_close(nvs_handle);
    
    if (err != ESP_OK) {
        return "";
    }
    
    return owner_id;
}

// Update get_cached_ownership_status():
bool get_cached_ownership_status(void) {
    // Check cache first
    if (cached_ownership_checked) {
        return cached_has_owner;
    }
    
    // Load from NVS
    cached_has_owner = has_owner();
    cached_ownership_checked = true;
    
    if (cached_has_owner) {
        const char* owner = get_cached_owner_id();
        ESP_LOGI(TAG, "Device owned by: %.16s...", owner);
    } else {
        ESP_LOGI(TAG, "Device is unowned");
    }
    
    return cached_has_owner;
}

// In the main loop, update discovery behavior:
// In unified_service_task, around the periodic broadcast section:

// Check ownership status
bool device_has_owner = get_cached_ownership_status();

if (wifi_connected && !device_has_owner &&
    (last_broadcast_time == 0 || 
     (current_time - last_broadcast_time) >= DISCOVERY_BROADCAST_INTERVAL_MS)) {
    
    ESP_LOGI(TAG, "📢 Unowned device - broadcasting discovery");
    
    // Send discovery broadcast
    err = send_discovery_broadcast();
    if (err == ESP_OK) {
        last_broadcast_time = current_time;
    }
    
} else if (wifi_connected && device_has_owner) {
    // SILENT MODE - owned device
    if (last_broadcast_time > 0) {
        ESP_LOGI(TAG, "🔇 Device owned - entering SILENT MODE");
        last_broadcast_time = 0;  // Stop broadcasts
        discovery_in_progress = false;
    }
    
    // Send heartbeat to owner if we know their address
    if (owner_address_known && 
        (current_time - last_heartbeat_time) >= HEARTBEAT_INTERVAL_MS) {
        
        // Send heartbeat (still using type 6 attestation but marked as owned)
        send_heartbeat_to_owner(owner_last_address, owner_last_port);
        last_heartbeat_time = current_time;
    }
}