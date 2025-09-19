# ESP32 Silent Mode Implementation Guide

## Overview
Once an ESP32 device is owned (paired), it should stop broadcasting discovery messages and only respond to direct communication from its owner.

## Implementation Steps

### 1. Add Ownership State Tracking

```c
// Global state variables
static bool is_owned = false;
static char owner_person_id[65] = {0};  // SHA256 hash as hex string
static time_t ownership_established_at = 0;

// Function to check if device is owned
bool device_is_owned() {
    return is_owned && strlen(owner_person_id) > 0;
}
```

### 2. Modify Credential Handler

```c
// In handle_credential_verification()
void handle_credential_verification(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    // ... existing credential verification code ...
    
    if (credential_is_valid && is_ownership_credential) {
        // Device is now owned
        is_owned = true;
        strncpy(owner_person_id, credential.owner_id, sizeof(owner_person_id) - 1);
        ownership_established_at = time(NULL);
        
        ESP_LOGI(TAG, "Device ownership established by: %s", owner_person_id);
        
        // Stop discovery timer
        if (discovery_timer != NULL) {
            esp_timer_stop(discovery_timer);
            ESP_LOGI(TAG, "Discovery broadcasts stopped - device is now owned");
        }
        
        // Send ownership confirmation response
        send_ownership_confirmed_response(source);
    }
}
```

### 3. Update Discovery Broadcast Function

```c
// Modified discovery broadcast function
void send_discovery_broadcast(void) {
    // Check if device is owned - if so, don't broadcast
    if (device_is_owned()) {
        ESP_LOGD(TAG, "Skipping discovery broadcast - device is owned");
        return;
    }
    
    // Only broadcast if not owned
    ESP_LOGI(TAG, "Sending discovery broadcast (device not owned)");
    
    // ... existing broadcast code ...
}
```

### 4. Update Discovery Request Handler

```c
// Modified discovery request handler
void handle_discovery_request(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    // Check if device is owned
    if (device_is_owned()) {
        ESP_LOGD(TAG, "Ignoring discovery request - device is owned");
        return;
    }
    
    // Only respond if not owned
    ESP_LOGI(TAG, "Responding to discovery request (device not owned)");
    
    // ... existing response code ...
}
```

### 5. Add Heartbeat/Ping Handler

```c
// New heartbeat handler for lightweight connectivity checks
void handle_heartbeat_request(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    cJSON *root = cJSON_Parse((char*)data);
    if (root == NULL) {
        ESP_LOGE(TAG, "Invalid heartbeat JSON");
        return;
    }
    
    // Extract heartbeat data
    cJSON *sender_id = cJSON_GetObjectItem(root, "senderPersonId");
    cJSON *sequence = cJSON_GetObjectItem(root, "sequence");
    
    // Verify sender is the owner
    if (!device_is_owned() || 
        !sender_id || 
        strcmp(sender_id->valuestring, owner_person_id) != 0) {
        ESP_LOGW(TAG, "Heartbeat from non-owner, ignoring");
        cJSON_Delete(root);
        return;
    }
    
    // Send heartbeat response
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "heartbeat_response");
    cJSON_AddStringToObject(response, "deviceId", device_id);
    cJSON_AddNumberToObject(response, "sequence", sequence ? sequence->valuedouble : 0);
    cJSON_AddNumberToObject(response, "timestamp", esp_timer_get_time() / 1000);
    cJSON_AddBoolToObject(response, "owned", true);
    cJSON_AddStringToObject(response, "ownerId", owner_person_id);
    
    char *response_str = cJSON_PrintUnformatted(response);
    
    // Send response
    sendto(service_socket, response_str, strlen(response_str), 0,
           (struct sockaddr *)source, sizeof(*source));
    
    free(response_str);
    cJSON_Delete(response);
    cJSON_Delete(root);
}
```

### 6. Add Ownership Removal Handler

```c
// Handle ownership removal (factory reset or explicit removal)
void handle_ownership_removal(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    // Verify the removal request is from the current owner
    // ... verification code ...
    
    if (verified_from_owner) {
        // Clear ownership state
        is_owned = false;
        memset(owner_person_id, 0, sizeof(owner_person_id));
        ownership_established_at = 0;
        
        ESP_LOGI(TAG, "Device ownership removed");
        
        // Restart discovery broadcasts
        if (discovery_timer != NULL) {
            esp_timer_start_periodic(discovery_timer, DISCOVERY_INTERVAL_US);
            ESP_LOGI(TAG, "Discovery broadcasts restarted");
        }
        
        // Send confirmation
        send_ownership_removed_response(source);
    }
}
```

### 7. Update Main Service Handler

```c
// In unified service message handler
void handle_service_message(uint8_t service_type, const uint8_t *data, 
                          size_t len, struct sockaddr_in *source) {
    switch (service_type) {
        case SERVICE_DISCOVERY:
            if (!device_is_owned()) {
                handle_discovery_message(data, len, source);
            }
            break;
            
        case SERVICE_CREDENTIALS:
            handle_credentials_message(data, len, source);
            break;
            
        case SERVICE_LED_CONTROL:
            // Only allow if from owner
            if (device_is_owned() && is_from_owner(data, len)) {
                handle_led_control(data, len, source);
            }
            break;
            
        case SERVICE_HEARTBEAT:
            handle_heartbeat_request(data, len, source);
            break;
            
        default:
            ESP_LOGW(TAG, "Unknown service type: 0x%02X", service_type);
    }
}
```

### 8. Persist Ownership State

```c
// Save ownership state to NVS
void save_ownership_state() {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_state", NVS_READWRITE, &nvs_handle);
    if (err == ESP_OK) {
        nvs_set_u8(nvs_handle, "is_owned", is_owned ? 1 : 0);
        nvs_set_str(nvs_handle, "owner_id", owner_person_id);
        nvs_set_i64(nvs_handle, "owned_since", ownership_established_at);
        nvs_commit(nvs_handle);
        nvs_close(nvs_handle);
    }
}

// Load ownership state from NVS on boot
void load_ownership_state() {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open("device_state", NVS_READONLY, &nvs_handle);
    if (err == ESP_OK) {
        uint8_t owned = 0;
        nvs_get_u8(nvs_handle, "is_owned", &owned);
        is_owned = (owned == 1);
        
        size_t owner_len = sizeof(owner_person_id);
        nvs_get_str(nvs_handle, "owner_id", owner_person_id, &owner_len);
        
        nvs_get_i64(nvs_handle, "owned_since", &ownership_established_at);
        nvs_close(nvs_handle);
        
        if (is_owned) {
            ESP_LOGI(TAG, "Device is owned by: %s", owner_person_id);
        }
    }
}
```

## Testing

1. **Initial Pairing**
   - Device should broadcast discovery
   - Accept ownership credential
   - Stop broadcasting immediately

2. **After Reboot**
   - Load ownership from NVS
   - Should NOT broadcast if owned
   - Only respond to owner's messages

3. **Heartbeat/Status**
   - Respond to heartbeats from owner
   - Ignore heartbeats from others
   - Maintain low latency responses

4. **Factory Reset**
   - Clear ownership state
   - Resume discovery broadcasts
   - Accept new owner

## Benefits

1. **Network Efficiency** - No unnecessary broadcasts from owned devices
2. **Security** - Owned devices are "invisible" to others
3. **Power Saving** - Less radio activity
4. **Scalability** - Networks with many devices won't flood with discovery