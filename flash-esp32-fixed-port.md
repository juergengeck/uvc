# ESP32 Fixed Port Flashing Instructions

## Overview
This guide will help you update your ESP32 firmware to use a fixed port (49497) for all services instead of dynamic port allocation.

## Prerequisites
- ESP-IDF installed and configured
- USB cable to connect ESP32
- Your ESP32 project directory

## Step 1: Backup Current main.c
```bash
cd /path/to/your/esp32/project
cp main/main.c main/main.c.backup
```

## Step 2: Update main.c

### Option A: Manual Integration
1. Open your `main/main.c` file
2. Add the new defines near the top (around line 40-50):
```c
#define UNIFIED_SERVICE_PORT 49497
#define SERVICE_DISCOVERY    0x01
#define SERVICE_CREDENTIALS  0x02
#define SERVICE_LED_CONTROL  0x03
#define SERVICE_DATA         0x04
```

3. Add the global socket variable:
```c
static int g_service_socket = -1;
static struct sockaddr_in g_service_addr;
```

4. Replace the following functions with the versions from `esp32-fixed-port-main.c`:
   - `init_unified_service_socket()` (new function - add before unified_service_task)
   - `send_discovery_broadcast()`
   - `send_discovery_response()`
   - `unified_service_task()`

### Option B: Full Replacement
If your main.c doesn't have many custom modifications:
```bash
# Compare the files first
diff main/main.c /path/to/esp32-fixed-port-main.c

# If changes look good, copy the relevant sections
```

## Step 3: Key Changes to Verify

1. **Fixed Port Binding**: The socket now binds to port 49497:
```c
g_service_addr.sin_port = htons(UNIFIED_SERVICE_PORT);
```

2. **Single Global Socket**: All services use `g_service_socket`

3. **Service Type Routing**: First byte determines service type

4. **No Dynamic Allocation**: Port is always 49497

## Step 4: Build the Firmware
```bash
# Clean build
idf.py fullclean

# Configure if needed
idf.py menuconfig

# Build
idf.py build
```

## Step 5: Flash the ESP32

### Find your ESP32 port:
```bash
# macOS
ls /dev/cu.* | grep -i usb

# Linux
ls /dev/ttyUSB*
```

### Flash the firmware:
```bash
# Replace /dev/cu.usbserial-0001 with your actual port
idf.py -p /dev/cu.usbserial-0001 flash

# Or specify baud rate for faster flashing
idf.py -p /dev/cu.usbserial-0001 -b 921600 flash
```

## Step 6: Monitor Output
```bash
# Monitor to verify the fixed port
idf.py -p /dev/cu.usbserial-0001 monitor

# You should see:
# I (xxxx) UnifiedService: ✅ Unified service socket bound to port 49497
# I (xxxx) UnifiedService: 🚀 Unified service task started on FIXED port 49497
```

## Step 7: Test Discovery

1. Start the Lama app
2. Enable discovery
3. Monitor ESP32 output - you should see:
```
I (xxxx) UnifiedService: 📡 Discovery broadcast sent from port 49497
I (xxxx) UnifiedService: 📢 Discovery response sent to x.x.x.x:49497 from port 49497
```

4. In the app logs, verify the ESP32 is discovered on port 49497:
```
[DiscoveryProtocol] Handling discovery request from device esp32-xxx at 192.168.x.x:49497
```

## Troubleshooting

### Port Already in Use
If you see "Failed to bind to port 49497":
1. Another process might be using the port
2. Try rebooting the ESP32
3. Check if SO_REUSEADDR is enabled in the code

### Discovery Not Working
1. Verify WiFi is connected
2. Check that both app and ESP32 are on same network
3. Ensure firewall isn't blocking UDP port 49497

### Credential Send Fails
1. Verify ESP32 shows port 49497 in discovery
2. Check app logs for "Invalid port" errors
3. Re-discover the device if needed

## Important Notes

1. **No Fallbacks**: The app will now refuse to send if port isn't 49497
2. **Re-discovery Required**: Devices saved with old ports need re-discovery
3. **Consistent Port**: All ESP32 devices will use the same port 49497

## Rollback
If you need to rollback:
```bash
cp main/main.c.backup main/main.c
idf.py fullclean
idf.py build
idf.py -p /dev/cu.usbserial-0001 flash
```