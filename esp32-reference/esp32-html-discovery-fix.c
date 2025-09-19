// ESP32 HTML Discovery Fix
// Fix send_discovery_broadcast() to use HTML format with service type 1 (DISCOVERY)

// Service type definitions
#define SERVICE_DISCOVERY    0x01  // Old JSON format (deprecated)
#define SERVICE_CREDENTIALS  0x02
#define SERVICE_LED_CONTROL  0x03
#define SERVICE_ESP32_DATA   0x04
#define SERVICE_JOURNAL_SYNC 0x05
#define SERVICE_ATTESTATION  0x06  // True cryptographic attestations (reserved)
#define SERVICE_VC_EXCHANGE  0x07

// Replace the send_discovery_broadcast() function in esp32-unified-service.c with:
esp_err_t send_discovery_broadcast(void) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Check ownership status from NVS
    char owner_id[65] = {0};
    size_t owner_len = sizeof(owner_id);
    bool is_owned = false;
    
    nvs_handle_t nvs_handle;
    if (nvs_open("device_cred", NVS_READONLY, &nvs_handle) == ESP_OK) {
        if (nvs_get_str(nvs_handle, "owner_id", owner_id, &owner_len) == ESP_OK) {
            is_owned = (strlen(owner_id) > 0);
        }
        nvs_close(nvs_handle);
    }
    
    // Create HTML discovery message
    char html_buffer[512];
    int html_len;
    
    if (is_owned) {
        // Include owner ID in claimed device discovery
        html_len = snprintf(html_buffer, sizeof(html_buffer),
            "<!DOCTYPE html>"
            "<html itemscope itemtype=\"https://refinio.one/DevicePresence\">"
            "<meta itemprop=\"$type$\" content=\"DevicePresence\">"
            "<meta itemprop=\"id\" content=\"%s\">"
            "<meta itemprop=\"type\" content=\"ESP32\">"
            "<meta itemprop=\"status\" content=\"online\">"
            "<meta itemprop=\"ownership\" content=\"claimed\">"
            "<meta itemprop=\"owner\" content=\"%s\">"
            "</html>",
            device_id, owner_id);
    } else {
        // Unclaimed device discovery
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
    
    // Create service packet with attestation service type
    uint8_t *packet = malloc(html_len + 1);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet buffer");
        return ESP_FAIL;
    }
    
    packet[0] = SERVICE_DISCOVERY;    // Service type byte (0x01)
    memcpy(packet + 1, html_buffer, html_len);
    
    // Send broadcast
    struct sockaddr_in broadcast_addr;
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_addr.s_addr = htonl(INADDR_BROADCAST);
    broadcast_addr.sin_port = htons(UNIFIED_SERVICE_PORT);  // Send to well-known port
    
    ssize_t sent = sendto(service_socket, packet, html_len + 1, 0,
                         (struct sockaddr *)&broadcast_addr, sizeof(broadcast_addr));
    
    free(packet);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send discovery broadcast: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📡 Discovery broadcast sent (%s, %d bytes)", 
             is_owned ? "claimed" : "unclaimed", (int)sent);
    
    return ESP_OK;
}

// Also update send_discovery_response() to use HTML format:
esp_err_t send_discovery_response(const char* target_ip, int target_port) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Check ownership status from NVS
    char owner_id[65] = {0};
    size_t owner_len = sizeof(owner_id);
    bool is_owned = false;
    
    nvs_handle_t nvs_handle;
    if (nvs_open("device_cred", NVS_READONLY, &nvs_handle) == ESP_OK) {
        if (nvs_get_str(nvs_handle, "owner_id", owner_id, &owner_len) == ESP_OK) {
            is_owned = (strlen(owner_id) > 0);
        }
        nvs_close(nvs_handle);
    }
    
    // Create HTML discovery response
    char html_buffer[512];
    int html_len;
    
    if (is_owned) {
        html_len = snprintf(html_buffer, sizeof(html_buffer),
            "<!DOCTYPE html>"
            "<html itemscope itemtype=\"https://refinio.one/DevicePresence\">"
            "<meta itemprop=\"$type$\" content=\"DevicePresence\">"
            "<meta itemprop=\"id\" content=\"%s\">"
            "<meta itemprop=\"type\" content=\"ESP32\">"
            "<meta itemprop=\"status\" content=\"online\">"
            "<meta itemprop=\"ownership\" content=\"claimed\">"
            "<meta itemprop=\"owner\" content=\"%s\">"
            "</html>",
            device_id, owner_id);
    } else {
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
    
    // Create service packet with attestation service type
    uint8_t *packet = malloc(html_len + 1);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet buffer");
        return ESP_FAIL;
    }
    
    packet[0] = SERVICE_DISCOVERY;    // Service type byte (0x01)
    memcpy(packet + 1, html_buffer, html_len);
    
    // Send to specific target
    struct sockaddr_in target_addr;
    memset(&target_addr, 0, sizeof(target_addr));
    target_addr.sin_family = AF_INET;
    target_addr.sin_port = htons(target_port);
    
    if (inet_pton(AF_INET, target_ip, &target_addr.sin_addr) != 1) {
        ESP_LOGE(TAG, "Invalid target IP address: %s", target_ip);
        free(packet);
        return ESP_FAIL;
    }
    
    ssize_t sent = sendto(service_socket, packet, html_len + 1, 0,
                         (struct sockaddr *)&target_addr, sizeof(target_addr));
    
    free(packet);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send discovery response: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📡 Discovery response sent to %s:%d (%s, %d bytes)", 
             target_ip, target_port, is_owned ? "claimed" : "unclaimed", (int)sent);
    
    return ESP_OK;
}

// Additional required includes for the functions above:
// #include "nvs_flash.h"
// #include "nvs.h"
// #include <arpa/inet.h>

// IMPORTANT: Also update the unified_service_task to handle incoming ATTESTATION messages:
// In the message handler switch statement, add:
//
// case SERVICE_DISCOVERY:
//     ESP_LOGI(TAG, "Received attestation/discovery from %s:%d", sender_ip, sender_port);
//     // Could trigger a discovery response here if needed
//     break;