// Integration example for ESP32 QUICVC
// Add this to your main ESP32 code

#include "esp32-quicvc-minimal.c"

// In your main initialization function, after WiFi is connected:
void app_main(void) {
    // ... existing initialization ...
    
    // Initialize regular service on port 49497
    init_unified_service();
    
    // Initialize QUICVC on port 49498
    if (quicvc_init() == ESP_OK) {
        ESP_LOGI(TAG, "QUICVC initialized successfully");
    } else {
        ESP_LOGE(TAG, "Failed to initialize QUICVC");
    }
    
    // Main loop
    while (1) {
        // Handle regular services (discovery, LED control, etc.)
        handle_unified_service();
        
        // Handle QUICVC packets
        quicvc_handle_packet();
        
        // Send QUICVC heartbeat every 20 seconds
        static uint32_t last_heartbeat = 0;
        uint32_t now = esp_timer_get_time() / 1000000;
        if (now - last_heartbeat > 20) {
            quicvc_send_heartbeat();
            last_heartbeat = now;
        }
        
        // Small delay to prevent watchdog
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// Example: Handling QUICVC commands
// When a QUICVC connection is established, you can receive commands like:
// {"type": "led_control", "state": "on"}
// These would arrive as FRAME_DATA packets in quicvc_handle_packet()

// Example: Sending data over QUICVC
void send_quicvc_data(const char *data) {
    if (!active_connection || active_connection->state != 2) {
        ESP_LOGW(TAG, "No active QUICVC connection");
        return;
    }
    
    // Build data frame
    uint8_t frame[512];
    frame[0] = FRAME_DATA;
    size_t data_len = strlen(data);
    memcpy(&frame[1], data, data_len);
    
    // In real implementation, this would be encrypted and sent
    ESP_LOGI(TAG, "Would send QUICVC data: %s", data);
}

// Key differences from full QUICVC:
// 1. Single connection support (not multiple)
// 2. No stream multiplexing
// 3. Simplified encryption (just key derivation, no AEAD yet)
// 4. No congestion control or flow control
// 5. Basic packet structure without full QUIC features
// 
// This is sufficient for:
// - Secure device authentication via VCs
// - Protected command/response exchange
// - Heartbeat monitoring
// - LED control and sensor data transfer