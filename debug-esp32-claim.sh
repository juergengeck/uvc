#!/bin/bash
# Debug ESP32 ownership claim by monitoring serial output

echo "=== ESP32 Ownership Claim Debugger ==="
echo "This will monitor ESP32 serial output while you try to claim ownership"
echo ""
echo "Instructions:"
echo "1. This script will start monitoring the ESP32"
echo "2. In your app, press the ownership toggle for the ESP32"
echo "3. Watch this window for ESP32 logs"
echo "4. Press Ctrl+C to stop monitoring"
echo ""
echo "Starting monitor in 3 seconds..."
sleep 3

cd /Users/gecko/src/uvc/packages/one.core.expo/src/system/esp32/esp32-quicvc-project
python3 monitor-only.py
