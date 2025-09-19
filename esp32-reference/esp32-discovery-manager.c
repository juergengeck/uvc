/**
 * ESP32 Ownership-Aware Discovery System
 * 
 * This implementation ensures that:
 * 1. ESP32 only broadcasts discovery when UNCLAIMED
 * 2. Discovery stops immediately upon receiving credentials
 * 3. Discovery resumes if ownership is removed
 * 4. Uses correct NVS namespace and HTML format
 */

#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include <string.h>
#include "lwip/sockets.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "ESP32_Discovery"

// Service type definitions
#define SERVICE_DISCOVERY    0x01  // HTML-based device discovery broadcast
#define SERVICE_VC_EXCHANGE  0x07

// NVS configuration - MUST match credential handler
#define NVS_NAMESPACE "esp32_device"
#define NVS_OWNER_ID_KEY "owner_id"

// Port configuration
#define UNIFIED_SERVICE_PORT 49497

// External variables
extern int service_socket;
extern char device_id[32];

// Discovery task handle for control
static TaskHandle_t discovery_task_handle = NULL;
static bool discovery_enabled = true;

/**
 * Check if device is owned (has stored credentials)
 */
bool is_device_owned(void) {
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return false;
    }
    
    char owner_id[65] = {0};
    size_t owner_len = sizeof(owner_id);
    bool is_owned = false;
    
    if (nvs_get_str(nvs_handle, NVS_OWNER_ID_KEY, owner_id, &owner_len) == ESP_OK) {
        is_owned = (strlen(owner_id) == 64); // Valid Person ID is 64 chars
    }
    
    nvs_close(nvs_handle);
    return is_owned;
}

/**
 * Get stored owner ID
 */
esp_err_t get_owner_id(char* owner_id_buffer, size_t buffer_size) {
    if (!owner_id_buffer || buffer_size < 65) {
        return ESP_ERR_INVALID_ARG;
    }
    
    nvs_handle_t nvs_handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &nvs_handle);
    if (err != ESP_OK) {
        return err;
    }
    
    size_t owner_len = buffer_size;
    err = nvs_get_str(nvs_handle, NVS_OWNER_ID_KEY, owner_id_buffer, &owner_len);
    nvs_close(nvs_handle);
    
    return err;
}

/**
 * Send discovery broadcast ONLY if device is unclaimed
 */
esp_err_t send_discovery_broadcast(void) {
    // CRITICAL: Check ownership status first
    if (is_device_owned()) {
        ESP_LOGI(TAG, "Device is owned - skipping discovery broadcast");
        return ESP_OK;  // Not an error, just skip
    }
    
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Device is unclaimed - sending discovery broadcast");
    
    // Create HTML discovery message for UNCLAIMED device only
    char html_buffer[512];
    int html_len = snprintf(html_buffer, sizeof(html_buffer),
        "<!DOCTYPE html>"
        "<html itemscope itemtype=\"https://refinio.one/DevicePresence\">"
        "<meta itemprop=\"$type$\" content=\"DevicePresence\">"
        "<meta itemprop=\"id\" content=\"%s\">"
        "<meta itemprop=\"type\" content=\"ESP32\">"
        "<meta itemprop=\"status\" content=\"online\">"
        "<meta itemprop=\"ownership\" content=\"unclaimed\">"
        "</html>",
        device_id);
    
    // Create service packet with attestation service type
    uint8_t *packet = malloc(html_len + 1);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet buffer");
        return ESP_FAIL;
    }
    
    packet[0] = SERVICE_DISCOVERY;     // Service type byte (0x01)
    memcpy(packet + 1, html_buffer, html_len);
    
    // Send broadcast
    struct sockaddr_in broadcast_addr;
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_addr.s_addr = htonl(INADDR_BROADCAST);
    broadcast_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
    
    ssize_t sent = sendto(service_socket, packet, html_len + 1, 0,
                         (struct sockaddr *)&broadcast_addr, sizeof(broadcast_addr));
    
    free(packet);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send discovery broadcast: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📡 Discovery broadcast sent (unclaimed, %d bytes)", (int)sent);
    return ESP_OK;
}

/**
 * Send discovery response with current ownership status
 */
esp_err_t send_discovery_response(const char* target_ip, int target_port) {
    if (service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    char html_buffer[512];
    int html_len;
    
    // Check ownership and create appropriate response
    if (is_device_owned()) {
        char owner_id[65] = {0};
        get_owner_id(owner_id, sizeof(owner_id));
        
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
    
    // Create and send packet
    uint8_t *packet = malloc(html_len + 1);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet buffer");
        return ESP_FAIL;
    }
    
    packet[0] = SERVICE_DISCOVERY;
    memcpy(packet + 1, html_buffer, html_len);
    
    struct sockaddr_in target_addr;
    memset(&target_addr, 0, sizeof(target_addr));
    target_addr.sin_family = AF_INET;
    target_addr.sin_port = htons(target_port);
    inet_pton(AF_INET, target_ip, &target_addr.sin_addr);
    
    ssize_t sent = sendto(service_socket, packet, html_len + 1, 0,
                         (struct sockaddr *)&target_addr, sizeof(target_addr));
    
    free(packet);
    
    if (sent < 0) {
        ESP_LOGE(TAG, "Failed to send discovery response: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "📡 Discovery response sent to %s:%d (%s, %d bytes)", 
             target_ip, target_port, 
             is_device_owned() ? "claimed" : "unclaimed", (int)sent);
    
    return ESP_OK;
}

/**
 * Stop discovery broadcasts (called when device is claimed)
 */
void stop_discovery_broadcasts(void) {
    ESP_LOGI(TAG, "🛑 Stopping discovery broadcasts - device is now owned");
    discovery_enabled = false;
    
    // Optionally delete the discovery task if it exists
    if (discovery_task_handle != NULL) {
        vTaskDelete(discovery_task_handle);
        discovery_task_handle = NULL;
        ESP_LOGI(TAG, "Discovery task terminated");
    }
}

/**
 * Resume discovery broadcasts (called when ownership is removed)
 */
void resume_discovery_broadcasts(void) {
    ESP_LOGI(TAG, "▶️ Resuming discovery broadcasts - device is now unclaimed");
    discovery_enabled = true;
    
    // Recreate discovery task if needed
    if (discovery_task_handle == NULL) {
        xTaskCreate(discovery_task, "discovery", 4096, NULL, 5, &discovery_task_handle);
        ESP_LOGI(TAG, "Discovery task restarted");
    }
}

/**
 * Discovery task - only broadcasts when device is unclaimed
 */
void discovery_task(void *pvParameters) {
    ESP_LOGI(TAG, "Discovery task started");
    
    while (1) {
        // Only broadcast if discovery is enabled AND device is unclaimed
        if (discovery_enabled && !is_device_owned()) {
            send_discovery_broadcast();
        } else if (is_device_owned()) {
            ESP_LOGD(TAG, "Skipping discovery - device is owned");
        }
        
        // Wait 5 seconds between broadcasts
        vTaskDelay(5000 / portTICK_PERIOD_MS);
    }
}

/**
 * Initialize discovery system
 */
void init_discovery_system(void) {
    ESP_LOGI(TAG, "Initializing discovery system");
    
    // Check initial ownership status
    if (is_device_owned()) {
        ESP_LOGI(TAG, "Device is already owned - discovery disabled");
        discovery_enabled = false;
    } else {
        ESP_LOGI(TAG, "Device is unclaimed - discovery enabled");
        discovery_enabled = true;
        
        // Create discovery task for unclaimed device
        xTaskCreate(discovery_task, "discovery", 4096, NULL, 5, &discovery_task_handle);
    }
}

// ============================================================================
// INTEGRATION WITH CREDENTIAL HANDLER
// ============================================================================

/**
 * Call this function after successfully storing credentials
 * in handle_provision_device() in esp32-credential-provisioning-handler.c
 */
void on_device_provisioned(void) {
    ESP_LOGI(TAG, "Device provisioned - stopping discovery broadcasts");
    stop_discovery_broadcasts();
}

/**
 * Call this function after successfully removing credentials
 * in handle_ownership_remove() in esp32-credential-provisioning-handler.c
 */
void on_ownership_removed(void) {
    ESP_LOGI(TAG, "Ownership removed - resuming discovery broadcasts");
    resume_discovery_broadcasts();
}

// ============================================================================
// USAGE INSTRUCTIONS
// ============================================================================
/**
 * 1. Replace the existing send_discovery_broadcast() in esp32-unified-service.c
 * 2. In handle_provision_device() after storing credentials, add:
 *    on_device_provisioned();
 * 
 * 3. In handle_ownership_remove() after removing credentials, add:
 *    on_ownership_removed();
 * 
 * 4. In app_main() or after WiFi connects, call:
 *    init_discovery_system();
 * 
 * 5. Remove any manual calls to send_discovery_broadcast() in loops
 * 
 * This ensures:
 * - Discovery only happens when device is unclaimed
 * - Discovery stops immediately upon provisioning
 * - Discovery resumes if ownership is removed
 * - No unnecessary network traffic for owned devices
 */