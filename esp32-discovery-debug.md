# ESP32 Discovery Debug Guide

## Quick Checks

### 1. Check ESP32 Serial Output
Connect to the ESP32 serial monitor to see if it's connecting to WiFi:
```bash
screen /dev/cu.usbserial-110 115200
```
(Press Ctrl+A, then K to exit)

You should see:
- "Connected to AP" message
- "Device ID initialized: esp32-5c013b678d30"
- "Sending discovery broadcast" messages every 10 seconds
- IP address assignment (should be 192.168.178.x)

### 2. Test Network Connectivity
From your Mac, try to receive UDP broadcasts:
```bash
# Listen for UDP broadcasts on port 49497
nc -u -l 49497
```

In another terminal, send a test broadcast:
```bash
echo "test" | nc -u -w1 255.255.255.255 49497
```

### 3. Network Isolation Check
Some routers have "AP Isolation" or "Client Isolation" enabled which blocks communication between WiFi clients.

Check if you can ping the ESP32 (once you know its IP from serial output):
```bash
ping 192.168.178.XXX  # Replace XXX with ESP32's IP
```

## Common Issues

### WiFi Not Connecting
- Wrong SSID/password
- 5GHz only network (ESP32 needs 2.4GHz)
- MAC filtering enabled on router

### UDP Broadcasts Blocked
- Router AP/Client isolation enabled
- Firewall on router blocking UDP broadcasts
- Some mesh networks block broadcasts between nodes

### Different Subnets
- ESP32 on guest network (different subnet)
- App device on cellular instead of WiFi
- VPN active on phone

## Alternative Test

Try using a direct UDP packet to the app's IP instead of broadcast:
1. Find your phone's IP (Settings > WiFi > Network details)
2. Modify ESP32 code to send to that specific IP temporarily

## ESP32 LED Indicators
- **Fast blinking** (100ms): Discovery in progress
- **Slow blinking** (1s): Normal operation, no discovery
- **Solid on/off**: Manual control via app

## Router Settings to Check
1. **AP/Client Isolation**: Should be DISABLED
2. **Multicast/Broadcast filtering**: Should be DISABLED
3. **UPnP**: Try enabling if disabled
4. **IGMP Snooping**: Try disabling if enabled

## Test with Simple UDP Tool
Install a UDP test app on your phone to verify UDP works:
- iOS: "UDP Test Tool" or "Network Utility"
- Android: "UDP Sender/Receiver"

Set it to receive on port 49497 and see if any packets arrive.