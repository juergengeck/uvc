// Alternative approach: Create a new function that sends both discovery messages
// Add this function after the existing send_discovery_response function (around line 433)

// Send both discovery request and response broadcasts
esp_err_t send_discovery_both(void)
{
    esp_err_t err;
    
    // Check if WiFi is connected
    EventBits_t bits = xEventGroupGetBits(wifi_event_group);
    bool wifi_connected = (bits & WIFI_CONNECTED_BIT) != 0;
    
    if (!wifi_connected) {
        ESP_LOGW(TAG, "Cannot send discovery - WiFi not connected");
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📡 Sending discovery request + response broadcast sequence");
    
    // First, send discovery request to ask others to identify
    err = send_discovery_broadcast();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to send discovery request");
        // Continue anyway to try response
    } else {
        ESP_LOGI(TAG, "✅ Discovery request sent");
    }
    
    // Small delay to avoid packet collision
    vTaskDelay(100 / portTICK_PERIOD_MS);
    
    // Second, send discovery response to announce ourselves
    ESP_LOGI(TAG, "📢 Broadcasting our presence with discovery response");
    err = send_discovery_response("255.255.255.255", DISCOVERY_PORT);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to send discovery response broadcast");
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "✅ Discovery response broadcast sent - we are now discoverable!");
    return ESP_OK;
}

// Then in unified_service_task, replace the send_discovery_broadcast() calls with:
// err = send_discovery_both();

// Example modification for the periodic broadcast section:
/*
        // Send periodic discovery broadcasts if connected to WiFi
        if (wifi_connected && 
            (last_broadcast_time == 0 || 
             (current_time - last_broadcast_time) >= DISCOVERY_BROADCAST_INTERVAL_MS)) {
            
            ESP_LOGI(TAG, "Sending periodic discovery broadcast (interval: %d ms, time: %llu ms)", 
                    DISCOVERY_BROADCAST_INTERVAL_MS, current_time);
            
            discovery_in_progress = true; // Set flag for LED sync
            discovery_flag_time = current_time; // Record timestamp
            
            // Send BOTH discovery request and response
            err = send_discovery_both();
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to send periodic discovery broadcasts");
            }
            
            // Update last broadcast time
            last_broadcast_time = current_time;
        }
*/