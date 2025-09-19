/**
 * ESP32 Discovery Broadcast Handler - FIXED VERSION
 * 
 * FIXES:
 * - Includes ownership status in discovery broadcasts
 * - Continues broadcasting during LED operations
 * - Uses full 64-character Person IDs
 * - Updates ownership status immediately after credential changes
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "lwip/sockets.h"
#include "lwip/netdb.h"

static const char *TAG = "ESP32_DISCOVERY";

// External functions from credential handler
extern bool has_stored_credential(void);
extern const char* get_ownership_status(void);

// Discovery configuration
#define DISCOVERY_PORT 49497
#define DISCOVERY_INTERVAL_MS 5000  // 5 seconds
#define SERVICE_TYPE_DISCOVERY 1  // Changed from 6 - now using type 1 for HTML discovery

// Device info
extern char device_id[32]; // Assume this is set elsewhere
static esp_timer_handle_t discovery_timer = NULL;
static bool discovery_enabled = true;

/**
 * Create HTML discovery message with ownership status
 * CRITICAL FIX: Always includes ownership field
 */
char* create_discovery_html(void) {
    const char* ownership_status = get_ownership_status();
    
    // HTML template with ownership status
    const char* html_template = 
        "<!DOCTYPE html>\n"
        "<html itemscope itemtype=\"https://refinio.one/DevicePresence\">\n"
        "<meta itemprop=\"$type$\" content=\"DevicePresence\">\n"
        "<meta itemprop=\"id\" content=\"%s\">\n"
        "<meta itemprop=\"type\" content=\"ESP32\">\n"
        "<meta itemprop=\"status\" content=\"online\">\n"
        "<meta itemprop=\"ownership\" content=\"%s\">\n"
        "</html>";
    
    // Allocate buffer for formatted HTML
    size_t buffer_size = strlen(html_template) + strlen(device_id) + strlen(ownership_status) + 10;
    char* html = malloc(buffer_size);
    
    if (html) {
        snprintf(html, buffer_size, html_template, device_id, ownership_status);
        ESP_LOGD(TAG, "Created discovery HTML with ownership: %s", ownership_status);
    } else {
        ESP_LOGE(TAG, "Failed to allocate memory for discovery HTML");
    }
    
    return html;
}

/**
 * Send discovery broadcast
 * CRITICAL FIX: Continues broadcasting even during LED operations
 */
void send_discovery_broadcast(void) {
    if (!discovery_enabled) {
        return;
    }
    
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) {
        ESP_LOGE(TAG, "Failed to create discovery socket");
        return;
    }
    
    // Enable broadcast
    int broadcast = 1;
    if (setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast)) < 0) {
        ESP_LOGE(TAG, "Failed to enable broadcast");
        close(sock);
        return;
    }
    
    // Create discovery message
    char* html_content = create_discovery_html();
    if (!html_content) {
        close(sock);
        return;
    }
    
    // Create packet with service type 6 (ATTESTATION)
    size_t html_len = strlen(html_content);
    uint8_t* packet = malloc(1 + html_len);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet memory");
        free(html_content);
        close(sock);
        return;
    }
    
    packet[0] = SERVICE_TYPE_DISCOVERY;  // Type 1 for HTML discovery
    memcpy(packet + 1, html_content, html_len);
    
    // Set up broadcast address
    struct sockaddr_in broadcast_addr;
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_port = htons(DISCOVERY_PORT);
    broadcast_addr.sin_addr.s_addr = inet_addr("255.255.255.255");
    
    // Send broadcast
    int sent = sendto(sock, packet, 1 + html_len, 0, 
                     (struct sockaddr*)&broadcast_addr, sizeof(broadcast_addr));
    
    if (sent > 0) {
        ESP_LOGD(TAG, "Discovery broadcast sent (%d bytes)", sent);
    } else {
        ESP_LOGW(TAG, "Failed to send discovery broadcast");
    }
    
    // Cleanup
    free(packet);
    free(html_content);
    close(sock);
}

/**
 * Discovery timer callback
 * CRITICAL FIX: Continues broadcasting during all operations
 */
void discovery_timer_callback(void* arg) {
    // IMPORTANT: No checks for LED operations or other activities
    // Device should always broadcast its presence when online
    send_discovery_broadcast();
}

/**
 * Force immediate discovery broadcast
 * Used after credential changes to update ownership status immediately
 */
void broadcast_device_presence_immediately(void) {
    ESP_LOGI(TAG, "Forcing immediate discovery broadcast");
    send_discovery_broadcast();
}

/**
 * Start discovery broadcasting
 */
esp_err_t start_discovery_broadcasting(void) {
    if (discovery_timer != NULL) {
        ESP_LOGW(TAG, "Discovery timer already running");
        return ESP_OK;
    }
    
    const esp_timer_create_args_t timer_args = {
        .callback = &discovery_timer_callback,
        .arg = NULL,
        .name = "discovery_timer"
    };
    
    esp_err_t err = esp_timer_create(&timer_args, &discovery_timer);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to create discovery timer: %s", esp_err_to_name(err));
        return err;
    }
    
    err = esp_timer_start_periodic(discovery_timer, DISCOVERY_INTERVAL_MS * 1000);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start discovery timer: %s", esp_err_to_name(err));
        esp_timer_delete(discovery_timer);
        discovery_timer = NULL;
        return err;
    }
    
    discovery_enabled = true;
    ESP_LOGI(TAG, "Discovery broadcasting started (every %d ms)", DISCOVERY_INTERVAL_MS);
    
    // Send immediate broadcast
    broadcast_device_presence_immediately();
    
    return ESP_OK;
}

/**
 * Stop discovery broadcasting
 */
esp_err_t stop_discovery_broadcasting(void) {
    if (discovery_timer == NULL) {
        ESP_LOGW(TAG, "Discovery timer not running");
        return ESP_OK;
    }
    
    discovery_enabled = false;
    
    esp_err_t err = esp_timer_stop(discovery_timer);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to stop discovery timer: %s", esp_err_to_name(err));
    }
    
    err = esp_timer_delete(discovery_timer);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to delete discovery timer: %s", esp_err_to_name(err));
    }
    
    discovery_timer = NULL;
    ESP_LOGI(TAG, "Discovery broadcasting stopped");
    
    return err;
}

/**
 * Update discovery broadcast after ownership changes
 * Called from credential handler after provisioning/removal
 */
void update_discovery_broadcast(void) {
    ESP_LOGI(TAG, "Updating discovery broadcast after ownership change");
    broadcast_device_presence_immediately();
}

/**
 * Check if discovery is currently broadcasting
 */
bool is_discovery_broadcasting(void) {
    return discovery_enabled && (discovery_timer != NULL);
}