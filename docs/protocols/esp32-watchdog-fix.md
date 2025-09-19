# ESP32 Watchdog Timer Fix

## Problem Summary
The ESP32 is experiencing watchdog timer resets (TG1WDT_SYS_RESET) because the main task is getting stuck or taking too long without feeding the watchdog.

## Root Causes Identified
1. **Missing watchdog feeds** in the main unified service task
2. **Tight loops** without sufficient delays
3. **Blocking socket operations** that can hang
4. **Memory allocation failures** not handled properly
5. **JSON processing** taking too long without watchdog feeds

## Applied Fixes

### 1. Watchdog Management
```c
#include "esp_task_wdt.h"

// Add task to watchdog
esp_task_wdt_add(NULL);

// Feed watchdog regularly
esp_task_wdt_reset();

// Remove from watchdog before task deletion
esp_task_wdt_delete(NULL);
```

### 2. Non-blocking Socket Operations
```c
// Set socket to non-blocking mode
int flags = fcntl(g_service_socket, F_GETFL, 0);
fcntl(g_service_socket, F_SETFL, flags | O_NONBLOCK);

// Use MSG_DONTWAIT flag
sendto(socket, data, len, MSG_DONTWAIT, addr, addrlen);
recvfrom(socket, buffer, size, MSG_DONTWAIT, addr, addrlen);
```

### 3. Proper Error Handling
```c
// Check for allocation failures
if (!packet) {
    ESP_LOGE(TAG, "Failed to allocate packet memory");
    free(json_str);
    return ESP_FAIL;
}

// Validate IP addresses
if (inet_pton(AF_INET, dest_ip, &dest_addr.sin_addr) <= 0) {
    ESP_LOGW(TAG, "Invalid IP address: %s", dest_ip);
    return ESP_FAIL;
}
```

### 4. Mandatory Task Delays
```c
#define MAIN_TASK_DELAY_MS 50

// Always delay at end of main loop
vTaskDelay(pdMS_TO_TICKS(MAIN_TASK_DELAY_MS));
```

### 5. Reduced Processing Frequency
```c
// Only update LED every 10 loops instead of every loop
if (discovery_in_progress && (loop_count % 10 == 0)) {
    set_blue_led(current_time_ms % 1000 < 500);
}
```

## Implementation Steps

### Step 1: Update your main.c file
Replace your existing `unified_service_task` function with the fixed version from `esp32-fixed-port-main.c`.

### Step 2: Add required includes
```c
#include "esp_task_wdt.h"
#include <fcntl.h>  // For fcntl flags
```

### Step 3: Update task creation (if needed)
```c
// Create task with sufficient stack size
xTaskCreate(unified_service_task, "unified_service", 8192, NULL, 5, NULL);
```

### Step 4: Configure watchdog timeout (optional)
```c
// In app_main(), configure watchdog timeout
esp_task_wdt_init(TASK_WDT_TIMEOUT_SECONDS, true);
```

## Key Changes Summary

1. **Added watchdog feeds** at critical points
2. **Non-blocking socket operations** to prevent hanging
3. **Proper error handling** for all allocations and network operations
4. **Mandatory 50ms delay** in main loop
5. **Reduced LED update frequency** to prevent tight loops
6. **Socket timeout configuration** for additional safety
7. **Improved logging** with byte counts and error details

## Expected Results

After applying these fixes:
- ✅ No more watchdog timer resets
- ✅ Stable ESP32 operation
- ✅ Continued discovery protocol functionality
- ✅ Better error recovery
- ✅ More predictable timing

## Testing

1. Flash the updated code to ESP32
2. Monitor serial output for:
   - "Added unified service task to watchdog"
   - "Unified service task started on FIXED port 49497" 
   - No more "WDT rst info" messages
   - Stable discovery broadcasts

## Additional Notes

- The discovery protocol functionality remains identical
- Port 49497 is still used for all services
- JSON payload structure is unchanged
- Lama app communication should work exactly as before
- The fixes only add stability and prevent resets 