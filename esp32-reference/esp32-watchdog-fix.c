// ESP32 Watchdog Fix for LED Task
// Add these modifications to your existing LED task or control code

#include "esp_task_wdt.h"  // Add this include at the top of your file

// Example LED task with proper watchdog handling
void led_task(void *pvParameters) {
    // Register this task with the Task Watchdog Timer
    esp_task_wdt_add(NULL);
    ESP_LOGI("LED", "LED task registered with watchdog");
    
    // LED state variables
    int led_state = 0;
    int led_mode = LED_MODE_OFF;
    
    while (1) {
        // Feed watchdog at the start of each loop iteration
        esp_task_wdt_reset();
        
        // Check current LED mode and blink accordingly
        switch (led_mode) {
            case LED_MODE_FAST:
                // Fast blinking mode (100ms intervals)
                gpio_set_level(LED_GPIO_NUM, led_state);
                led_state = !led_state;
                ESP_LOGD("LED", "Fast blink: %d", led_state);
                
                // Feed watchdog before delay
                esp_task_wdt_reset();
                vTaskDelay(pdMS_TO_TICKS(100));
                break;
                
            case LED_MODE_SLOW:
                // Slow blinking mode (1 second intervals)
                gpio_set_level(LED_GPIO_NUM, led_state);
                led_state = !led_state;
                ESP_LOGD("LED", "Slow blink: %d", led_state);
                
                // Feed watchdog before delay
                esp_task_wdt_reset();
                vTaskDelay(pdMS_TO_TICKS(1000));
                break;
                
            case LED_MODE_ON:
                // LED constantly on
                gpio_set_level(LED_GPIO_NUM, 1);
                
                // Feed watchdog before delay
                esp_task_wdt_reset();
                vTaskDelay(pdMS_TO_TICKS(500));
                break;
                
            case LED_MODE_OFF:
            default:
                // LED off
                gpio_set_level(LED_GPIO_NUM, 0);
                
                // Feed watchdog before delay
                esp_task_wdt_reset();
                vTaskDelay(pdMS_TO_TICKS(500));
                break;
        }
    }
    
    // Cleanup (never reached)
    esp_task_wdt_delete(NULL);
    vTaskDelete(NULL);
}

// If you're controlling LEDs inline within another task, add watchdog resets:
void some_other_task(void *pvParameters) {
    // Register with watchdog at task start
    esp_task_wdt_add(NULL);
    
    while (1) {
        // Feed watchdog at loop start
        esp_task_wdt_reset();
        
        // ... other task operations ...
        
        // If doing LED control in a tight loop
        if (fast_led_mode) {
            for (int i = 0; i < 20; i++) {  // 20 * 100ms = 2 seconds
                toggle_led();
                
                // CRITICAL: Feed watchdog in tight loops!
                esp_task_wdt_reset();
                vTaskDelay(pdMS_TO_TICKS(100));
            }
        }
        
        // Normal task delay
        esp_task_wdt_reset();
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}