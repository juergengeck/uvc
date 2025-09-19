/**
 * Simple test file to compile just the LED handler
 * Compile with: gcc -I. esp32-led-test.c -o led-test
 */

#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>

// Mock ESP32 types and functions for testing
#define ESP_LOGI(tag, fmt, ...) printf("[%s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGW(tag, fmt, ...) printf("[WARN %s] " fmt "\n", tag, ##__VA_ARGS__)
#define ESP_LOGE(tag, fmt, ...) printf("[ERROR %s] " fmt "\n", tag, ##__VA_ARGS__)

#define GPIO_NUM_2 2
#define portTICK_PERIOD_MS 1

// Simple JSON mock
typedef struct cJSON {
    char *string;
    struct cJSON *child;
    struct cJSON *next;
    int type;
    double valuedouble;
} cJSON;

#define cJSON_IsString(item) ((item)->type == 16)
#define cJSON_IsObject(item) ((item)->type == 64)
#define cJSON_IsNumber(item) ((item)->type == 8)

struct sockaddr_in {
    uint16_t sin_port;
    uint32_t sin_addr;
};

char *inet_ntoa(struct sockaddr_in *addr) { return "192.168.1.100"; }
uint16_t ntohs(uint16_t port) { return port; }

// Mock functions
void gpio_set_level(int pin, int level) {
    printf("GPIO %d set to %d\n", pin, level);
}

int gpio_get_level(int pin) {
    static int level = 0;
    return level;
}

void vTaskDelay(int ms) {
    printf("Delay %d ms\n", ms);
}

cJSON *cJSON_Parse(const char *str) {
    printf("Parsing JSON: %s\n", str);
    // Return mock parsed object
    static cJSON root = {0};
    return &root;
}

void cJSON_Delete(cJSON *item) {
    // No-op
}

cJSON *cJSON_GetObjectItem(cJSON *object, const char *name) {
    printf("Getting item: %s\n", name);
    static cJSON item = {0};
    if (strcmp(name, "command") == 0) {
        item.type = 64; // Object
        return &item;
    }
    if (strcmp(name, "action") == 0) {
        item.type = 16; // String
        item.string = "toggle";
        return &item;
    }
    return NULL;
}

const char *cJSON_GetStringValue(cJSON *item) {
    return item->string;
}

double cJSON_GetNumberValue(cJSON *item) {
    return item->valuedouble;
}

cJSON *cJSON_CreateObject(void) {
    static cJSON obj = {0};
    return &obj;
}

void cJSON_AddStringToObject(cJSON *object, const char *name, const char *string) {
    printf("Adding to response: %s = %s\n", name, string);
}

void cJSON_AddBoolToObject(cJSON *object, const char *name, int b) {
    printf("Adding to response: %s = %s\n", name, b ? "true" : "false");
}

void send_json_response(cJSON *response, struct sockaddr_in *source, int service_type) {
    printf("Sending JSON response on service type %d\n", service_type);
}

static const char *TAG = "LED_TEST";

// Include the actual LED handler function
void handle_led_control_message(const uint8_t *data, size_t len, struct sockaddr_in *source) {
    ESP_LOGI(TAG, "Received LED control message from %s:%d (len=%d)", 
             inet_ntoa(source), ntohs(source->sin_port), len);
    
    // Skip service type byte
    if (len < 2) {
        ESP_LOGW(TAG, "Message too short");
        return;
    }
    
    // Parse JSON message
    const char *json_str = (const char*)(data + 1);
    cJSON *json = cJSON_Parse(json_str);
    if (!json) {
        ESP_LOGE(TAG, "Failed to parse JSON");
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "Invalid JSON");
        send_json_response(response, source, 3); // SERVICE_LED_CONTROL
        cJSON_Delete(response);
        return;
    }
    
    // Get command from the JSON
    cJSON *command_item = cJSON_GetObjectItem(json, "command");
    if (!command_item || !cJSON_IsObject(command_item)) {
        ESP_LOGE(TAG, "No command object in LED control message");
        cJSON_Delete(json);
        
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "No command object");
        send_json_response(response, source, 3);
        cJSON_Delete(response);
        return;
    }
    
    // Get the action from command
    cJSON *action_item = cJSON_GetObjectItem(command_item, "action");
    if (!action_item || !cJSON_IsString(action_item)) {
        ESP_LOGE(TAG, "No action in LED command");
        cJSON_Delete(json);
        
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "No action specified");
        send_json_response(response, source, 3);
        cJSON_Delete(response);
        return;
    }
    
    const char *action = cJSON_GetStringValue(action_item);
    ESP_LOGI(TAG, "LED action: %s", action);
    
    // Control the LED based on action
    if (strcmp(action, "on") == 0) {
        gpio_set_level(GPIO_NUM_2, 1);  // Turn LED ON
        ESP_LOGI(TAG, "LED turned ON");
    } else if (strcmp(action, "off") == 0) {
        gpio_set_level(GPIO_NUM_2, 0);  // Turn LED OFF
        ESP_LOGI(TAG, "LED turned OFF");
    } else if (strcmp(action, "toggle") == 0) {
        int current_level = gpio_get_level(GPIO_NUM_2);
        gpio_set_level(GPIO_NUM_2, !current_level);  // Toggle LED
        ESP_LOGI(TAG, "LED toggled to %s", !current_level ? "ON" : "OFF");
    } else if (strcmp(action, "blink") == 0) {
        // Get duration if provided
        cJSON *duration_item = cJSON_GetObjectItem(command_item, "duration");
        int duration = duration_item && cJSON_IsNumber(duration_item) ? 
                      cJSON_GetNumberValue(duration_item) : 1000;
        
        // Blink the LED
        gpio_set_level(GPIO_NUM_2, 1);
        vTaskDelay(duration / 2 / portTICK_PERIOD_MS);
        gpio_set_level(GPIO_NUM_2, 0);
        vTaskDelay(duration / 2 / portTICK_PERIOD_MS);
        ESP_LOGI(TAG, "LED blinked for %d ms", duration);
    } else {
        ESP_LOGW(TAG, "Unknown LED action: %s", action);
        cJSON_Delete(json);
        
        // Send error response
        cJSON *response = cJSON_CreateObject();
        cJSON_AddStringToObject(response, "type", "error");
        cJSON_AddStringToObject(response, "error", "Unknown action");
        send_json_response(response, source, 3);
        cJSON_Delete(response);
        return;
    }
    
    // Send success response
    cJSON *response = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "led_status");
    cJSON_AddStringToObject(response, "status", "ok");
    cJSON_AddStringToObject(response, "action", action);
    cJSON_AddBoolToObject(response, "success", true);
    
    // Get requestId if present and include it in response
    cJSON *request_id = cJSON_GetObjectItem(json, "requestId");
    if (request_id && cJSON_IsString(request_id)) {
        cJSON_AddStringToObject(response, "requestId", cJSON_GetStringValue(request_id));
    }
    
    send_json_response(response, source, 3); // SERVICE_LED_CONTROL
    cJSON_Delete(response);
    cJSON_Delete(json);
}

int main() {
    printf("Testing LED handler...\n");
    
    // Test message: service_type (3) + JSON
    const char *json_msg = "{\"command\":{\"action\":\"toggle\"},\"requestId\":\"123\"}";
    uint8_t message[256] = {3}; // Service type 3
    strcpy((char*)(message + 1), json_msg);
    
    struct sockaddr_in source = {.sin_port = 49497, .sin_addr = 0xC0A80164};
    
    handle_led_control_message(message, strlen(json_msg) + 1, &source);
    
    return 0;
}