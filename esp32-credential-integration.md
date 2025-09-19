# ESP32 Credential Handler Integration Guide

## Quick Integration Steps

### 1. Add Required Includes
Add these includes to your main.c file:
```c
#include "nvs_flash.h"
#include "nvs.h"
```

### 2. Add Credential Storage Variables
Add these global variables after your other globals:
```c
// Credential storage
static char current_owner[128] = {0};
static bool has_owner_flag = false;
static nvs_handle_t nvs_handle = 0;
```

### 3. Add Minimal Credential Handler
Add this simplified handler function before `unified_service_task`:

```c
// Simple credential handler
void handle_credential_service(const char *payload, size_t len, struct sockaddr_in *src_addr) {
    ESP_LOGI(TAG, "🔐 Received credential message (%d bytes)", (int)len);
    
    // Parse JSON
    cJSON *root = cJSON_Parse(payload);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse credential JSON");
        return;
    }
    
    // Get credential field
    cJSON *credential = cJSON_GetObjectItem(root, "credential");
    if (!credential || !cJSON_IsString(credential)) {
        ESP_LOGE(TAG, "No credential field found");
        cJSON_Delete(root);
        return;
    }
    
    // For now, just log and acknowledge
    ESP_LOGI(TAG, "Received credential: %.100s...", cJSON_GetStringValue(credential));
    
    // Extract source info from packet
    cJSON *source = cJSON_GetObjectItem(root, "source");
    const char *source_str = source ? cJSON_GetStringValue(source) : "unknown";
    
    // Check if we already have an owner
    if (has_owner_flag) {
        ESP_LOGW(TAG, "Device already has owner, rejecting new credential");
        cJSON_Delete(root);
        return;
    }
    
    // Simple validation - just check it's from lama-app
    if (strcmp(source_str, "lama-app") == 0) {
        // Mark as owned
        has_owner_flag = true;
        strncpy(current_owner, "lama-user", sizeof(current_owner) - 1);
        
        // Save to NVS
        if (nvs_handle) {
            nvs_set_u8(nvs_handle, "has_owner", 1);
            nvs_set_str(nvs_handle, "owner", current_owner);
            nvs_commit(nvs_handle);
        }
        
        ESP_LOGI(TAG, "✅ Device claimed by owner");
        
        // Change LED to green
        set_led_color(0, 255, 0);
        
        // Send acknowledgment
        send_credential_ack(src_addr, true);
    }
    
    cJSON_Delete(root);
}

// Simple acknowledgment sender
void send_credential_ack(struct sockaddr_in *dest_addr, bool success) {
    if (g_service_socket < 0) return;
    
    // Create simple ACK
    cJSON *ack = cJSON_CreateObject();
    cJSON_AddStringToObject(ack, "type", "credential_ack");
    cJSON_AddBoolToObject(ack, "success", success);
    cJSON_AddStringToObject(ack, "deviceId", device_id);
    
    char *json_str = cJSON_PrintUnformatted(ack);
    if (!json_str) return;
    
    // Create packet
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    if (!packet) {
        free(json_str);
        return;
    }
    
    packet[0] = SERVICE_CREDENTIALS;
    memcpy(packet + 1, json_str, json_len);
    
    // Send
    sendto(g_service_socket, packet, json_len + 1, MSG_DONTWAIT,
           (struct sockaddr *)dest_addr, sizeof(struct sockaddr_in));
    
    ESP_LOGI(TAG, "📤 Sent credential ACK (success=%s)", success ? "true" : "false");
    
    free(packet);
    free(json_str);
}

// Update has_owner function
bool has_owner(void) {
    return has_owner_flag;
}
```

### 4. Initialize NVS in app_main
Add this to your `app_main()` function after WiFi init:
```c
// Initialize NVS for credential storage
esp_err_t err = nvs_flash_init();
if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
}
ESP_ERROR_CHECK(err);

// Open NVS handle
err = nvs_open("credentials", NVS_READWRITE, &nvs_handle);
if (err == ESP_OK) {
    // Check if we have an owner
    uint8_t has_owner_val = 0;
    nvs_get_u8(nvs_handle, "has_owner", &has_owner_val);
    has_owner_flag = (has_owner_val == 1);
    
    if (has_owner_flag) {
        size_t owner_len = sizeof(current_owner);
        nvs_get_str(nvs_handle, "owner", current_owner, &owner_len);
        ESP_LOGI(TAG, "Device has owner: %s", current_owner);
    }
}
```

### 5. Update Discovery Response
Modify your `send_discovery_response` function to include ownership status:
```c
// Add ownership status to discovery response
if (has_owner()) {
    cJSON_AddBoolToObject(root, "hasOwner", true);
    cJSON_AddStringToObject(root, "ownerId", current_owner);
}
```

## Testing the Implementation

1. Flash the updated firmware to your ESP32
2. Monitor the serial output
3. In the LAMA app, discover the device
4. Send ownership credential
5. You should see:
   - ESP32 logs: "🔐 Received credential message"
   - ESP32 logs: "✅ Device claimed by owner"
   - LED changes to green
   - App receives acknowledgment

## Troubleshooting

- If credentials aren't received, check:
  - ESP32 is listening on port 49497
  - Service type byte is 0x02
  - JSON parsing is working

- If acknowledgments aren't received by app:
  - Check the socket is still valid
  - Verify the destination address/port
  - Check firewall settings

## Security Notes

This is a simplified implementation. For production:
1. Properly decode base64 credentials
2. Verify cryptographic signatures
3. Check credential expiration
4. Implement proper permission checking
5. Use secure storage for sensitive data