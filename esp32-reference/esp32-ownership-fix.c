// ESP32 Ownership Check Fix
// Add this debug logging to understand why ownership check is failing

// Replace the has_owner() function with this version that includes logging:

bool has_owner(void) {
    // Try to load stored credential
    quicvc_credential_data_t stored_cred;
    esp_err_t err = quicvc_credential_load(&stored_cred, NULL, "device_cred");
    
    ESP_LOGI(TAG, "🔍 has_owner() check: load_result=%s, is_valid=%s", 
            esp_err_to_name(err),
            (err == ESP_OK) ? (stored_cred.is_valid ? "YES" : "NO") : "N/A");
    
    if (err == ESP_OK && stored_cred.is_valid) {
        ESP_LOGI(TAG, "🔒 Device is owned by: %s", stored_cred.issuer);
        return true;
    } else {
        ESP_LOGI(TAG, "🔓 Device has no owner");
        return false;
    }
}

// Also add logging before the periodic broadcast check:

        // Check if device has an owner
        bool device_has_owner = has_owner();
        ESP_LOGI(TAG, "📊 Ownership status for broadcast decision: %s", 
                device_has_owner ? "OWNED" : "NOT OWNED");
        
        // Send periodic discovery broadcasts ONLY if no owner is set
        if (wifi_connected && !device_has_owner &&
            (last_broadcast_time == 0 || 
             (current_time - last_broadcast_time) >= DISCOVERY_BROADCAST_INTERVAL_MS)) {
            
            ESP_LOGI(TAG, "📢 Device not owned - sending periodic discovery broadcast");
            // ... rest of broadcast code ...
            
        } else if (wifi_connected && device_has_owner) {
            // Log why we're NOT broadcasting
            if (last_broadcast_time > 0) {
                ESP_LOGI(TAG, "🔇 Device is owned - discovery broadcasts disabled");
                last_broadcast_time = 0; // Reset to prevent repeated logs
            }
        }

// IMPORTANT: Also check if the stored credential might be corrupted
// Add this validation in the send_discovery_response function:

    if (load_result == ESP_OK) {
        ESP_LOGI(TAG, "🔍 Discovery response credential valid: %s", stored_cred.is_valid ? "YES" : "NO");
        if (stored_cred.is_valid) {
            // Additional validation
            if (strlen(stored_cred.issuer) == 0) {
                ESP_LOGW(TAG, "⚠️ Credential has empty issuer - treating as invalid");
                device_has_owner = false;
            } else if (strlen(stored_cred.issuer) < 10) {
                ESP_LOGW(TAG, "⚠️ Credential issuer too short (%zu chars) - possible corruption", 
                        strlen(stored_cred.issuer));
            } else {
                strncpy(owner_id, stored_cred.issuer, sizeof(owner_id) - 1);
                device_has_owner = true;
                ESP_LOGI(TAG, "🔍 Discovery response owner ID: %s (length: %zu)", 
                        owner_id, strlen(owner_id));
            }
        }
    }