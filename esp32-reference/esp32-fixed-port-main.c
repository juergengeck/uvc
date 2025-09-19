// ESP32 Fixed Port Configuration for main.c
// Replace the unified_service_task and related functions in your main.c

#include "esp_task_wdt.h"  // Add this include at top

// Add this near the top with other defines (around line 40-50)
#define UNIFIED_SERVICE_PORT 49497  // Fixed port for all services
#define SERVICE_DISCOVERY    0x01
#define SERVICE_CREDENTIALS  0x02
#define SERVICE_LED_CONTROL  0x03
#define SERVICE_DATA         0x04

// Task watchdog configuration
#define TASK_WDT_TIMEOUT_SECONDS 10
#define MAIN_TASK_DELAY_MS 50

// Global service socket
static int g_service_socket = -1;
static struct sockaddr_in g_service_addr;

// Initialize the unified service socket (add this function before unified_service_task)
esp_err_t init_unified_service_socket(void) {
    // Create UDP socket
    g_service_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (g_service_socket < 0) {
        ESP_LOGE(TAG, "Failed to create service socket: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    // Set socket to non-blocking mode
    int flags = fcntl(g_service_socket, F_GETFL, 0);
    if (flags < 0 || fcntl(g_service_socket, F_SETFL, flags | O_NONBLOCK) < 0) {
        ESP_LOGW(TAG, "Failed to set socket non-blocking: %s", strerror(errno));
    }
    
    // Set receive timeout
    struct timeval timeout;
    timeout.tv_sec = 0;
    timeout.tv_usec = 100000; // 100ms timeout
    if (setsockopt(g_service_socket, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) < 0) {
        ESP_LOGW(TAG, "Failed to set socket timeout: %s", strerror(errno));
    }
    
    // Enable broadcast
    int broadcast = 1;
    if (setsockopt(g_service_socket, SOL_SOCKET, SO_BROADCAST, &broadcast, sizeof(broadcast)) < 0) {
        ESP_LOGE(TAG, "Failed to enable broadcast: %s", strerror(errno));
        close(g_service_socket);
        g_service_socket = -1;
        return ESP_FAIL;
    }
    
    // Enable port reuse
    int reuse = 1;
    if (setsockopt(g_service_socket, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse)) < 0) {
        ESP_LOGW(TAG, "Failed to enable SO_REUSEADDR: %s", strerror(errno));
    }
    
    // Bind to fixed port
    memset(&g_service_addr, 0, sizeof(g_service_addr));
    g_service_addr.sin_family = AF_INET;
    g_service_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    g_service_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
    
    if (bind(g_service_socket, (struct sockaddr *)&g_service_addr, sizeof(g_service_addr)) < 0) {
        ESP_LOGE(TAG, "Failed to bind to port %d: %s", UNIFIED_SERVICE_PORT, strerror(errno));
        close(g_service_socket);
        g_service_socket = -1;
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "✅ Unified service socket bound to port %d", UNIFIED_SERVICE_PORT);
    return ESP_OK;
}

// Modified send_discovery_broadcast function with error handling
esp_err_t send_discovery_broadcast(void) {
    if (g_service_socket < 0) {
        ESP_LOGE(TAG, "Service socket not initialized");
        return ESP_FAIL;
    }
    
    // Feed watchdog before processing
    esp_task_wdt_reset();
    
    // Create discovery message JSON
    cJSON *root = cJSON_CreateObject();
    if (!root) {
        ESP_LOGE(TAG, "Failed to create JSON object");
        return ESP_FAIL;
    }
    
    cJSON_AddStringToObject(root, "type", "discovery_request");
    cJSON_AddStringToObject(root, "deviceId", device_id);
    cJSON_AddStringToObject(root, "deviceName", "ESP32");
    cJSON_AddStringToObject(root, "deviceType", "ESP32");
    cJSON_AddStringToObject(root, "version", "1.0.0");
    cJSON_AddNumberToObject(root, "timestamp", xTaskGetTickCount());
    
    cJSON *capabilities = cJSON_CreateArray();
    if (capabilities) {
        cJSON_AddItemToArray(capabilities, cJSON_CreateString("control"));
        cJSON_AddItemToArray(capabilities, cJSON_CreateString("data-sync"));
        cJSON_AddItemToObject(root, "capabilities", capabilities);
    }
    
    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    
    if (!json_str) {
        ESP_LOGE(TAG, "Failed to create JSON string");
        return ESP_FAIL;
    }
    
    // Create service packet with discovery service type
    size_t json_len = strlen(json_str);
    if (json_len > 800) { // Prevent oversized packets
        ESP_LOGW(TAG, "JSON payload too large: %d bytes", json_len);
        free(json_str);
        return ESP_FAIL;
    }
    
    uint8_t *packet = malloc(json_len + 1);
    if (!packet) {
        ESP_LOGE(TAG, "Failed to allocate packet memory");
        free(json_str);
        return ESP_FAIL;
    }
    
    packet[0] = SERVICE_DISCOVERY;
    memcpy(packet + 1, json_str, json_len);
    
    // Send broadcast to port 49497
    struct sockaddr_in broadcast_addr;
    memset(&broadcast_addr, 0, sizeof(broadcast_addr));
    broadcast_addr.sin_family = AF_INET;
    broadcast_addr.sin_addr.s_addr = htonl(INADDR_BROADCAST);
    broadcast_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
    
    ssize_t sent = sendto(g_service_socket, packet, json_len + 1, MSG_DONTWAIT,
                         (struct sockaddr *)&broadcast_addr, sizeof(broadcast_addr));
    
    free(packet);
    free(json_str);
    
    if (sent < 0) {
        ESP_LOGW(TAG, "Failed to send discovery broadcast: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Discovery broadcast sent from port %d (%d bytes)", UNIFIED_SERVICE_PORT, (int)sent);
    return ESP_OK;
}

// Modified send_discovery_response function with error handling
esp_err_t send_discovery_response(const char *dest_ip, uint16_t dest_port) {
    if (g_service_socket < 0 || !dest_ip) {
        ESP_LOGE(TAG, "Invalid parameters for discovery response");
        return ESP_FAIL;
    }
    
    // Feed watchdog before processing
    esp_task_wdt_reset();
    
    // Create discovery response JSON
    cJSON *root = cJSON_CreateObject();
    if (!root) {
        ESP_LOGE(TAG, "Failed to create JSON object");
        return ESP_FAIL;
    }
    
    cJSON_AddStringToObject(root, "type", "discovery_response");
    cJSON_AddStringToObject(root, "deviceId", device_id);
    cJSON_AddStringToObject(root, "deviceName", "ESP32");
    cJSON_AddStringToObject(root, "deviceType", "ESP32");
    cJSON_AddStringToObject(root, "version", "1.0.0");
    cJSON_AddNumberToObject(root, "timestamp", xTaskGetTickCount());
    
    cJSON *capabilities = cJSON_CreateArray();
    if (capabilities) {
        cJSON_AddItemToArray(capabilities, cJSON_CreateString("control"));
        cJSON_AddItemToArray(capabilities, cJSON_CreateString("data-sync"));
        cJSON_AddItemToObject(root, "capabilities", capabilities);
    }
    
    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    
    if (!json_str) {
        ESP_LOGE(TAG, "Failed to create JSON string");
        return ESP_FAIL;
    }
    
    // Create service packet
    size_t json_len = strlen(json_str);
    uint8_t *packet = malloc(json_len + 1);
    if (!packet) {
        free(json_str);
        return ESP_FAIL;
    }
    
    packet[0] = SERVICE_DISCOVERY;
    memcpy(packet + 1, json_str, json_len);
    
    // Send response
    struct sockaddr_in dest_addr;
    memset(&dest_addr, 0, sizeof(dest_addr));
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(dest_port);
    
    if (inet_pton(AF_INET, dest_ip, &dest_addr.sin_addr) <= 0) {
        ESP_LOGW(TAG, "Invalid IP address: %s", dest_ip);
        free(packet);
        free(json_str);
        return ESP_FAIL;
    }
    
    ssize_t sent = sendto(g_service_socket, packet, json_len + 1, MSG_DONTWAIT,
                         (struct sockaddr *)&dest_addr, sizeof(dest_addr));
    
    free(packet);
    free(json_str);
    
    if (sent < 0) {
        ESP_LOGW(TAG, "Failed to send discovery response: %s", strerror(errno));
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Discovery response sent to %s:%d from port %d (%d bytes)", 
             dest_ip, dest_port, UNIFIED_SERVICE_PORT, (int)sent);
    return ESP_OK;
}

// Replace the unified_service_task function with watchdog protection
void unified_service_task(void *pvParameters) {
    esp_err_t err;
    
    // Add this task to watchdog
    esp_task_wdt_add(NULL);
    ESP_LOGI(TAG, "Added unified service task to watchdog");
    
    // Initialize the service socket
    err = init_unified_service_socket();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize service socket");
        esp_task_wdt_delete(NULL);
        vTaskDelete(NULL);
        return;
    }
    
    ESP_LOGI(TAG, "Unified service task started on FIXED port %d", UNIFIED_SERVICE_PORT);
    ESP_LOGI(TAG, "📋 Handling services: Discovery (type 1), Credentials (type 2), LED Control (type 3)");
    
    // Message receive buffer
    uint8_t rx_buffer[1024];
    struct sockaddr_in client_addr;
    socklen_t client_addr_len;
    
    // Discovery timing
    TickType_t last_broadcast_time = 0;
    TickType_t discovery_flag_time = 0;
    bool discovery_in_progress = false;
    uint32_t loop_count = 0;
    
    while (1) {
        // Feed watchdog at start of each loop
        esp_task_wdt_reset();
        loop_count++;
        
        // Get current time
        TickType_t current_time = xTaskGetTickCount();
        uint32_t current_time_ms = current_time * portTICK_PERIOD_MS;
        
        // Check WiFi status
        EventBits_t bits = xEventGroupGetBits(wifi_event_group);
        bool wifi_connected = (bits & WIFI_CONNECTED_BIT) != 0;
        
        // Send periodic discovery if WiFi connected and no owner
        if (wifi_connected && !has_owner() &&
            (last_broadcast_time == 0 || 
             (current_time_ms - (last_broadcast_time * portTICK_PERIOD_MS)) >= DISCOVERY_BROADCAST_INTERVAL_MS)) {
            
            ESP_LOGI(TAG, "🔓 Manual trigger - no owner, sending discovery broadcasts");
            discovery_in_progress = true;
            discovery_flag_time = current_time_ms;
            
            // Log discovery payload for debugging
            ESP_LOGI(TAG, "Discovery payload: {\"type\":\"discovery_request\",\"deviceId\":\"%s\",\"deviceName\":\"ESP32\",\"deviceType\":\"ESP32\",\"version\":\"1.0.0\",\"timestamp\":%u,\"capabilities\":[\"control\",\"data-sync\"]}", 
                     device_id, (unsigned int)current_time);
            
            // Send discovery request
            err = send_discovery_broadcast();
            if (err == ESP_OK) {
                ESP_LOGI(TAG, "Discovery broadcast sent from port %d (%d bytes)", UNIFIED_SERVICE_PORT, 177);
                ESP_LOGI(TAG, "✅ Sent discovery request (manual)");
                
                // Small delay between operations
                vTaskDelay(pdMS_TO_TICKS(50));
                esp_task_wdt_reset();
            }
            
            last_broadcast_time = current_time;
        }
        
        // Clear discovery flag after timeout
        if (discovery_in_progress && 
            (current_time_ms - discovery_flag_time) >= DISCOVERY_FLAG_DURATION_MS) {
            discovery_in_progress = false;
        }
        
        // Check for manual discovery trigger
        if (discovery_event == DISCOVERY_EVENT_SEND) {
            if (wifi_connected && !has_owner()) {
                ESP_LOGI(TAG, "📡 Manual discovery trigger");
                discovery_in_progress = true;
                discovery_flag_time = current_time_ms;
                
                err = send_discovery_broadcast();
                if (err == ESP_OK) {
                    vTaskDelay(pdMS_TO_TICKS(50));
                    esp_task_wdt_reset();
                }
                
                last_broadcast_time = current_time;
            }
            discovery_event = DISCOVERY_EVENT_NONE;
        }
        
        // Sync blue LED with discovery (reduced frequency to prevent tight loops)
        if (discovery_in_progress && (loop_count % 10 == 0)) {
            set_blue_led(current_time_ms % 1000 < 500);
        }
        
        // Receive messages (non-blocking with timeout)
        client_addr_len = sizeof(client_addr);
        ssize_t len = recvfrom(g_service_socket, rx_buffer, sizeof(rx_buffer) - 1, MSG_DONTWAIT,
                              (struct sockaddr *)&client_addr, &client_addr_len);
        
        if (len > 0) {
            rx_buffer[len] = '\0';  // Null terminate
            
            // Get client info
            char client_ip[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &client_addr.sin_addr, client_ip, sizeof(client_ip));
            uint16_t client_port = ntohs(client_addr.sin_port);
            
            ESP_LOGI(TAG, "📨 Received %d bytes from %s:%d", (int)len, client_ip, client_port);
            
            // Feed watchdog before processing message
            esp_task_wdt_reset();
            
            // Check service type
            if (len > 1) {
                uint8_t service_type = rx_buffer[0];
                char *payload = (char *)(rx_buffer + 1);
                
                switch (service_type) {
                    case SERVICE_DISCOVERY:
                        handle_discovery_service(payload, len - 1, &client_addr);
                        break;
                        
                    case SERVICE_CREDENTIALS:
                        handle_credential_service(payload, len - 1, &client_addr);
                        break;
                        
                    case SERVICE_LED_CONTROL:
                        handle_led_service(payload, len - 1, &client_addr);
                        break;
                        
                    case SERVICE_DATA:
                        handle_data_service(payload, len - 1, &client_addr);
                        break;
                        
                    default:
                        ESP_LOGW(TAG, "Unknown service type: 0x%02X", service_type);
                }
            }
            
            // Feed watchdog after processing message
            esp_task_wdt_reset();
        } else if (len < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
            ESP_LOGW(TAG, "recvfrom error: %s", strerror(errno));
        }
        
        // Mandatory delay to prevent tight loop and allow other tasks to run
        vTaskDelay(pdMS_TO_TICKS(MAIN_TASK_DELAY_MS));
    }
    
    // Cleanup (never reached)
    ESP_LOGI(TAG, "Unified service task ending - cleaning up");
    esp_task_wdt_delete(NULL);
    if (g_service_socket >= 0) {
        close(g_service_socket);
        g_service_socket = -1;
    }
    vTaskDelete(NULL);
}