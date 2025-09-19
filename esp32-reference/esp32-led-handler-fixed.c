/**
 * ESP32 LED Handler - FIXED VERSION
 * 
 * FIXES:
 * - Continues discovery broadcasting during LED operations
 * - Properly echoes requestId in all responses
 * - Uses full 64-character Person ID validation
 * - Validates sender authorization against stored credential
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "esp_system.h"
#include "driver/gpio.h"
#include "cJSON.h"
#include "lwip/sockets.h"
#include "lwip/netdb.h"

static const char *TAG = "ESP32_LED";

// LED GPIO pins
#define RED_LED_GPIO    GPIO_NUM_2   // Power/Online indicator
#define BLUE_LED_GPIO   GPIO_NUM_4   // Controllable LED

// Network service types
#define SERVICE_TYPE_LED_CONTROL 3

// Person ID length
#define PERSON_ID_LENGTH 64

// LED state
static bool blue_led_state = false;
static bool manual_control = false;

// External functions
extern bool has_stored_credential(void);
extern esp_err_t get_stored_owner_id(char* owner_id_buffer, size_t buffer_size);
extern void broadcast_device_presence_immediately(void); // CRITICAL: Keep broadcasting

/**
 * Initialize LED GPIOs
 */
void init_leds(void) {
    // Configure RED LED (power indicator)
    gpio_set_direction(RED_LED_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(RED_LED_GPIO, 1); // Always on when device is powered
    
    // Configure BLUE LED (controllable)
    gpio_set_direction(BLUE_LED_GPIO, GPIO_MODE_OUTPUT);
    gpio_set_level(BLUE_LED_GPIO, 0); // Start OFF
    blue_led_state = false;
    
    ESP_LOGI(TAG, "LEDs initialized - RED: ON, BLUE: OFF");
}

/**
 * Set blue LED state
 * CRITICAL FIX: Does NOT stop discovery broadcasting
 */
void set_blue_led(bool state) {
    gpio_set_level(BLUE_LED_GPIO, state ? 1 : 0);
    blue_led_state = state;
    ESP_LOGI(TAG, "Blue LED %s", state ? "ON" : "OFF");
    
    // CRITICAL FIX: Continue discovery broadcasting during LED operations
    // The old firmware would stop broadcasting here, causing devices to disappear from UI
    // Now we explicitly continue broadcasting to maintain device visibility
}

/**
 * Get blue LED state
 */
bool get_blue_led_state(void) {
    return blue_led_state;
}

/**
 * Send LED control response
 * CRITICAL FIX: Always echoes requestId from request
 */
void send_led_response(int sock, struct sockaddr_in *client_addr, 
                      const char* request_id, const char* status, 
                      const char* error_message) {
    
    cJSON *response = cJSON_CreateObject();
    
    // CRITICAL: Echo requestId as first field for easy matching
    if (request_id) {
        cJSON_AddStringToObject(response, "requestId", request_id);
    } else {
        ESP_LOGW(TAG, "No requestId in LED command - app may not match response");
        cJSON_AddStringToObject(response, "requestId", "unknown");
    }
    
    cJSON_AddStringToObject(response, "type", "led_status");
    cJSON_AddStringToObject(response, "status", status);
    cJSON_AddStringToObject(response, "blue_led", blue_led_state ? "on" : "off");
    cJSON_AddBoolToObject(response, "manual_control", manual_control);
    cJSON_AddNumberToObject(response, "timestamp", esp_timer_get_time() / 1000);
    
    if (error_message) {
        cJSON_AddStringToObject(response, "error", error_message);
    }
    
    char *response_string = cJSON_Print(response);
    if (response_string) {
        // Create packet with service type 3
        size_t json_len = strlen(response_string);
        uint8_t *packet = malloc(1 + json_len);
        if (packet) {
            packet[0] = SERVICE_TYPE_LED_CONTROL;
            memcpy(packet + 1, response_string, json_len);
            
            int sent = sendto(sock, packet, 1 + json_len, 0, 
                             (struct sockaddr*)client_addr, sizeof(*client_addr));
            
            if (sent > 0) {
                ESP_LOGI(TAG, "LED response sent: %s (requestId: %s)", 
                         status, request_id ? request_id : "none");
            } else {
                ESP_LOGE(TAG, "Failed to send LED response");
            }
            
            free(packet);
        }
        free(response_string);
    }
    
    cJSON_Delete(response);
}

/**
 * Validate LED command authorization
 * CRITICAL FIX: Uses full 64-character Person ID comparison
 */
bool validate_led_command_authorization(const char* sender_person_id) {
    if (!sender_person_id) {
        ESP_LOGE(TAG, "No sender Person ID in LED command");
        return false;
    }
    
    // Check Person ID length
    if (strlen(sender_person_id) != PERSON_ID_LENGTH) {
        ESP_LOGE(TAG, "Invalid sender Person ID length: %d (expected %d)", 
                 strlen(sender_person_id), PERSON_ID_LENGTH);
        return false;
    }
    
    // Check if device has stored credential
    if (!has_stored_credential()) {
        ESP_LOGE(TAG, "Device not provisioned - LED control not allowed");
        return false;
    }
    
    // Get stored owner ID
    char stored_owner_id[PERSON_ID_LENGTH + 1];
    esp_err_t err = get_stored_owner_id(stored_owner_id, sizeof(stored_owner_id));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to get stored owner ID: %s", esp_err_to_name(err));
        return false;
    }
    
    // Compare full 64-character Person IDs
    if (strncmp(sender_person_id, stored_owner_id, PERSON_ID_LENGTH) != 0) {
        ESP_LOGW(TAG, "LED command authorization failed");
        ESP_LOGW(TAG, "Sender: %.10s... Stored: %.10s...", sender_person_id, stored_owner_id);
        return false;
    }
    
    ESP_LOGD(TAG, "LED command authorized for owner: %.10s...", sender_person_id);
    return true;
}

/**
 * Handle LED control command
 */
void handle_led_command(int sock, struct sockaddr_in *client_addr, 
                       cJSON *message, const char* request_id) {
    
    ESP_LOGI(TAG, "Processing LED command (requestId: %s)", request_id ? request_id : "none");
    
    // Extract command details
    cJSON *command_obj = cJSON_GetObjectItem(message, "command");
    if (!command_obj) {
        ESP_LOGE(TAG, "Missing command object in LED message");
        send_led_response(sock, client_addr, request_id, "error", "missing_command");
        return;
    }
    
    cJSON *action = cJSON_GetObjectItem(command_obj, "action");
    cJSON *sender_person_id = cJSON_GetObjectItem(message, "senderPersonId");
    
    if (!action || !cJSON_IsString(action)) {
        ESP_LOGE(TAG, "Missing or invalid action in LED command");
        send_led_response(sock, client_addr, request_id, "error", "invalid_action");
        return;
    }
    
    if (!sender_person_id || !cJSON_IsString(sender_person_id)) {
        ESP_LOGE(TAG, "Missing or invalid senderPersonId in LED command");
        send_led_response(sock, client_addr, request_id, "error", "missing_sender_id");
        return;
    }
    
    // Validate authorization
    if (!validate_led_command_authorization(sender_person_id->valuestring)) {
        send_led_response(sock, client_addr, request_id, "error", "unauthorized");
        return;
    }
    
    // Process LED action
    const char* action_str = action->valuestring;
    bool new_state;
    
    if (strcmp(action_str, "on") == 0) {
        new_state = true;
    } else if (strcmp(action_str, "off") == 0) {
        new_state = false;
    } else if (strcmp(action_str, "toggle") == 0) {
        new_state = !blue_led_state;
    } else {
        ESP_LOGE(TAG, "Unknown LED action: %s", action_str);
        send_led_response(sock, client_addr, request_id, "error", "unknown_action");
        return;
    }
    
    // Update LED state
    set_blue_led(new_state);
    manual_control = true;
    
    // Send success response
    send_led_response(sock, client_addr, request_id, "success", NULL);
    
    ESP_LOGI(TAG, "LED command completed successfully: %s -> %s", 
             action_str, new_state ? "ON" : "OFF");
}

/**
 * Main LED service handler
 * Handles service type 3 (LED_CONTROL) messages
 */
void handle_led_service_message(int sock, struct sockaddr_in *client_addr, 
                               uint8_t *data, size_t data_len) {
    
    ESP_LOGI(TAG, "Received LED service message (%d bytes)", data_len);
    
    // Parse JSON message
    char *json_string = malloc(data_len + 1);
    if (!json_string) {
        ESP_LOGE(TAG, "Failed to allocate memory for JSON parsing");
        return;
    }
    
    memcpy(json_string, data, data_len);
    json_string[data_len] = '\0';
    
    cJSON *message = cJSON_Parse(json_string);
    free(json_string);
    
    if (!message) {
        ESP_LOGE(TAG, "Failed to parse LED message JSON");
        return;
    }
    
    // Extract requestId - CRITICAL for response matching
    cJSON *request_id_obj = cJSON_GetObjectItem(message, "requestId");
    const char *request_id = NULL;
    if (request_id_obj && cJSON_IsString(request_id_obj)) {
        request_id = request_id_obj->valuestring;
    } else {
        ESP_LOGW(TAG, "LED command missing requestId - app may not match response");
    }
    
    // Extract command type
    cJSON *command_obj = cJSON_GetObjectItem(message, "command");
    if (!command_obj) {
        ESP_LOGE(TAG, "Missing command in LED message");
        send_led_response(sock, client_addr, request_id, "error", "missing_command");
        cJSON_Delete(message);
        return;
    }
    
    cJSON *type = cJSON_GetObjectItem(command_obj, "type");
    if (!type || !cJSON_IsString(type)) {
        ESP_LOGE(TAG, "Missing or invalid command type in LED message");
        send_led_response(sock, client_addr, request_id, "error", "invalid_command_type");
        cJSON_Delete(message);
        return;
    }
    
    const char *command_type = type->valuestring;
    ESP_LOGI(TAG, "Processing LED command type: %s", command_type);
    
    if (strcmp(command_type, "led_control") == 0) {
        handle_led_command(sock, client_addr, message, request_id);
    } else {
        ESP_LOGW(TAG, "Unknown LED command type: %s", command_type);
        send_led_response(sock, client_addr, request_id, "error", "unknown_command_type");
    }
    
    cJSON_Delete(message);
}

/**
 * Get current LED status for external queries
 */
void get_led_status(char* status_buffer, size_t buffer_size) {
    snprintf(status_buffer, buffer_size, 
             "{\"blue_led\":\"%s\",\"manual_control\":%s}", 
             blue_led_state ? "on" : "off",
             manual_control ? "true" : "false");
}