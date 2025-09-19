// ESP32 Complete Ownership Fix
// The issue: ESP32 has a credential but still broadcasts discovery messages

// 1. First, ensure has_owner() is called ONCE per loop iteration and cached:

// In unified_service_task, at the beginning of the main loop:
void unified_service_task(void *pvParameters) {
    // ... existing initialization code ...
    
    // Main service loop
    while (1) {
        TickType_t current_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
        
        // Check ownership status ONCE per iteration
        bool device_has_owner = has_owner();
        
        // Log ownership status periodically (every 30 seconds)
        static TickType_t last_ownership_log = 0;
        if (current_time - last_ownership_log > 30000) {
            ESP_LOGI(TAG, "🔍 Device ownership status: %s", 
                    device_has_owner ? "OWNED - Discovery disabled" : "UNOWNED - Discovery enabled");
            if (device_has_owner) {
                quicvc_credential_data_t cred;
                if (quicvc_credential_load(&cred, NULL, "device_cred") == ESP_OK) {
                    ESP_LOGI(TAG, "🔒 Owner ID: %s", cred.issuer);
                }
            }
            last_ownership_log = current_time;
        }
        
        // ... rest of the task code ...
        
        // IMPORTANT: Make sure the periodic broadcast check uses the cached value:
        if (wifi_connected && !device_has_owner &&
            (last_broadcast_time == 0 || 
             (current_time - last_broadcast_time) >= DISCOVERY_BROADCAST_INTERVAL_MS)) {
            
            ESP_LOGI(TAG, "📢 Device not owned - sending periodic discovery broadcast");
            // ... broadcast code ...
        }
    }
}

// 2. Fix the has_owner() function to be more robust:

bool has_owner(void) {
    quicvc_credential_data_t stored_cred;
    memset(&stored_cred, 0, sizeof(stored_cred)); // Initialize to zeros
    
    esp_err_t err = quicvc_credential_load(&stored_cred, NULL, "device_cred");
    
    if (err != ESP_OK) {
        ESP_LOGD(TAG, "has_owner: Failed to load credential: %s", esp_err_to_name(err));
        return false;
    }
    
    // Check if credential is valid
    if (!stored_cred.is_valid) {
        ESP_LOGD(TAG, "has_owner: Credential marked as invalid");
        return false;
    }
    
    // Check if issuer is present and valid length
    size_t issuer_len = strlen(stored_cred.issuer);
    if (issuer_len == 0) {
        ESP_LOGW(TAG, "has_owner: Credential has empty issuer");
        return false;
    }
    
    // SHA256 hash should be 64 characters
    if (issuer_len < 63 || issuer_len > 64) {
        ESP_LOGW(TAG, "has_owner: Invalid issuer length: %zu", issuer_len);
        return false;
    }
    
    // Valid credential with issuer
    ESP_LOGD(TAG, "has_owner: Device owned by %s", stored_cred.issuer);
    return true;
}

// 3. Add a function to clear corrupted credentials:

void validate_and_fix_credential(void) {
    quicvc_credential_data_t cred;
    esp_err_t err = quicvc_credential_load(&cred, NULL, "device_cred");
    
    if (err == ESP_OK && cred.is_valid) {
        // Check for corruption
        if (strlen(cred.issuer) == 0 || strlen(cred.issuer) < 63) {
            ESP_LOGW(TAG, "Corrupted credential detected - clearing");
            nvs_handle_t nvs_handle;
            if (nvs_open("quicvc", NVS_READWRITE, &nvs_handle) == ESP_OK) {
                nvs_erase_key(nvs_handle, "device_cred");
                nvs_commit(nvs_handle);
                nvs_close(nvs_handle);
            }
        }
    }
}

// 4. Call validation on startup:
void app_main(void) {
    // ... existing initialization ...
    
    // Validate stored credential
    validate_and_fix_credential();
    
    // ... rest of app_main ...
}