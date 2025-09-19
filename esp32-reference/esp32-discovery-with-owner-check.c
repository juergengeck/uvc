// ESP32 Discovery with Owner Check
// When device has an owner, it should only listen and respond, not broadcast

// Add this function to check if device has an owner (add after init_device_id function)
bool has_owner(void) {
    char owner_id[64] = {0};
    esp_err_t err = quicvc_auth_get_owner(owner_id);
    return (err == ESP_OK && strlen(owner_id) > 0);
}

// Modified unified_service_task discovery section:

        // Check if device has an owner
        bool device_has_owner = has_owner();
        
        // Send periodic discovery broadcasts ONLY if no owner is set
        if (wifi_connected && !device_has_owner &&
            (last_broadcast_time == 0 || 
             (current_time - last_broadcast_time) >= DISCOVERY_BROADCAST_INTERVAL_MS)) {
            
            ESP_LOGI(TAG, "🔓 No owner set - sending discovery broadcasts (interval: %d ms)", 
                    DISCOVERY_BROADCAST_INTERVAL_MS);
            
            discovery_in_progress = true; // Set flag for LED sync
            discovery_flag_time = current_time; // Record timestamp
            
            // Send discovery request to find other devices
            err = send_discovery_broadcast();
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to send discovery request");
            } else {
                ESP_LOGI(TAG, "✅ Sent discovery request");
            }
            
            // Small delay
            vTaskDelay(100 / portTICK_PERIOD_MS);
            
            // Send discovery response to announce we're available for pairing
            ESP_LOGI(TAG, "📢 Broadcasting availability for pairing");
            err = send_discovery_response("255.255.255.255", DISCOVERY_PORT);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to send discovery response");
            } else {
                ESP_LOGI(TAG, "✅ Sent discovery response - available for pairing!");
            }
            
            // Update last broadcast time
            last_broadcast_time = current_time;
            
        } else if (wifi_connected && device_has_owner) {
            // Device has owner - only listen, don't broadcast
            if (last_broadcast_time > 0) {
                ESP_LOGI(TAG, "🔒 Device has owner - switching to listen-only mode");
                last_broadcast_time = 0; // Reset to prevent log spam
            }
        }

        // Manual trigger section - also check for owner
        if (discovery_event == DISCOVERY_EVENT_SEND) {
            if (wifi_connected) {
                if (!device_has_owner) {
                    ESP_LOGI(TAG, "🔓 Manual trigger - no owner, sending discovery broadcasts");
                    discovery_in_progress = true;
                    discovery_flag_time = current_time;
                    
                    // Send both request and response
                    err = send_discovery_broadcast();
                    if (err == ESP_OK) {
                        vTaskDelay(100 / portTICK_PERIOD_MS);
                        err = send_discovery_response("255.255.255.255", DISCOVERY_PORT);
                    }
                    
                    last_broadcast_time = current_time;
                } else {
                    ESP_LOGI(TAG, "🔒 Device has owner - ignoring manual discovery trigger");
                }
            } else {
                ESP_LOGW(TAG, "Cannot send discovery - WiFi not connected");
            }
            discovery_event = DISCOVERY_EVENT_NONE;
        }

// Also modify the handle_discovery_service function to ALWAYS respond to requests:
// (This ensures owned devices still respond when asked directly)

esp_err_t handle_discovery_service(char *payload, int payload_len, struct sockaddr_in *client_addr) {
    // ... existing code ...
    
    // Check for discovery request
    if (strcmp(type_str, "discovery_request") == 0) {
        // Extract device ID
        cJSON *device_id_obj = cJSON_GetObjectItem(root, "deviceId");
        if (device_id_obj != NULL && cJSON_IsString(device_id_obj)) {
            const char *remote_device_id = device_id_obj->valuestring;
            ESP_LOGI(TAG, "✅ Discovery request from device ID: %s", remote_device_id);
            
            // ALWAYS respond to discovery requests, even if we have an owner
            // This allows the owner's app to find us
            esp_err_t resp_err = send_discovery_response(client_ip, client_port);
            if (resp_err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to send discovery response");
            } else {
                bool device_has_owner = has_owner();
                if (device_has_owner) {
                    ESP_LOGI(TAG, "🔒 Sent discovery response (device owned)");
                } else {
                    ESP_LOGI(TAG, "🔓 Sent discovery response (available for pairing)");
                }
            }
        }
    }
    
    // ... rest of existing code ...
}