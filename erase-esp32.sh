#!/bin/bash

# ESP32 Flash Erase Script
# Completely erases the ESP32 flash including NVS storage

set -e  # Exit on error

echo "🗑️  ESP32 Flash Erase Tool"
echo "========================="
echo ""
echo "⚠️  This will completely erase the ESP32 flash memory"
echo "   including all stored credentials and settings."
echo ""

# ESP-IDF paths
IDF_PATH="/Users/gecko/esp/esp-idf"
IDF_PYTHON="/Users/gecko/.espressif/python_env/idf5.5_py3.12_env/bin/python"

# Source ESP-IDF environment
echo "📦 Setting up ESP-IDF environment..."
if [ -f "$IDF_PATH/export.sh" ]; then
    source "$IDF_PATH/export.sh" > /dev/null 2>&1
else
    echo "❌ Error: ESP-IDF not found at $IDF_PATH"
    exit 1
fi

# Find connected ESP32 devices
echo "🔍 Looking for connected ESP32 devices..."
PORTS=$(ls /dev/cu.usbmodem* /dev/tty.usbmodem* /dev/cu.usbserial* /dev/tty.usbserial* /dev/cu.SLAB* /dev/tty.SLAB* /dev/cu.wchusbserial* /dev/tty.wchusbserial* 2>/dev/null || true)

if [ -z "$PORTS" ]; then
    echo "❌ No ESP32 devices found. Please connect your ESP32 via USB."
    exit 1
fi

# Erase each connected device
for PORT in $PORTS; do
    echo ""
    echo "📡 Found device at $PORT"
    echo "🗑️  Erasing flash..."
    
    $IDF_PYTHON $IDF_PATH/components/esptool_py/esptool/esptool.py --chip esp32c3 -p "$PORT" erase_flash
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully erased $PORT"
    else
        echo "⚠️  Failed to erase $PORT (device might be in use or incompatible)"
    fi
done

echo ""
echo "🎉 Flash erase complete!"
echo ""
echo "The ESP32 is now completely blank."
echo "Run ./flash-esp32.sh to flash the firmware again."