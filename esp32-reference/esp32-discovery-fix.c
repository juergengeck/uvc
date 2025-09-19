// ESP32 Discovery Fix - Send both request and response broadcasts
// Replace the unified_service_task section in main.c around lines 870-892

// In unified_service_task, modify the periodic discovery broadcast section:

        // Send periodic discovery broadcasts if connected to WiFi
        if (wifi_connected && 
            (last_broadcast_time == 0 || 
             (current_time - last_broadcast_time) >= DISCOVERY_BROADCAST_INTERVAL_MS)) {
            
            ESP_LOGI(TAG, "Sending periodic discovery broadcast (interval: %d ms, time: %llu ms)", 
                    DISCOVERY_BROADCAST_INTERVAL_MS, current_time);
            
            discovery_in_progress = true; // Set flag for LED sync
            discovery_flag_time = current_time; // Record timestamp
            
            // Log the flag state for debugging
            ESP_LOGI(TAG, "📶 DISCOVERY FLAG SET: progress=%d, time=%llu, duration=%u", 
                    discovery_in_progress, discovery_flag_time, DISCOVERY_FLAG_DURATION_MS);
            
            // Send discovery request to ask others to identify themselves
            err = send_discovery_broadcast();
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to send periodic discovery request broadcast");
            } else {
                ESP_LOGI(TAG, "✅ Sent discovery request broadcast");
            }
            
            // Small delay between packets to avoid collision
            vTaskDelay(100 / portTICK_PERIOD_MS);
            
            // ALSO send discovery response to announce ourselves
            ESP_LOGI(TAG, "📢 Broadcasting discovery response to announce ESP32");
            err = send_discovery_response("255.255.255.255", DISCOVERY_PORT);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to send discovery response broadcast");
            } else {
                ESP_LOGI(TAG, "✅ Sent discovery response broadcast - ESP32 announced!");
            }
            
            // Update last broadcast time
            last_broadcast_time = current_time;
        }

// Also modify the manual trigger section around line 853:

        // Send discovery if manual trigger and WiFi is connected
        if (discovery_event == DISCOVERY_EVENT_SEND) {
            if (wifi_connected) {
                ESP_LOGI(TAG, "Sending discovery broadcast (manual trigger)");
                discovery_in_progress = true; // Set flag for LED sync
                discovery_flag_time = current_time; // Record timestamp
                
                // Send discovery request
                err = send_discovery_broadcast();
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to send discovery request broadcast");
                } else {
                    ESP_LOGI(TAG, "✅ Sent discovery request (manual)");
                }
                
                // Small delay
                vTaskDelay(100 / portTICK_PERIOD_MS);
                
                // Also send discovery response
                ESP_LOGI(TAG, "📢 Broadcasting discovery response (manual trigger)");
                err = send_discovery_response("255.255.255.255", DISCOVERY_PORT);
                if (err != ESP_OK) {
                    ESP_LOGE(TAG, "Failed to send discovery response broadcast");
                } else {
                    ESP_LOGI(TAG, "✅ Sent discovery response (manual) - ESP32 announced!");
                }
                
                // Update last broadcast time
                last_broadcast_time = current_time;
            } else {
                ESP_LOGW(TAG, "Cannot send discovery broadcast - WiFi not connected");
            }
            discovery_event = DISCOVERY_EVENT_NONE;
        }