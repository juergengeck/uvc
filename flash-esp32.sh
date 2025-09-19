#!/bin/bash

# ESP32 Flash Script
# Builds and flashes ESP32 firmware to connected devices

set -e  # Exit on error

echo "🚀 ESP32 Flash Tool"
echo "==================="
echo ""

# Project paths
PROJECT_ROOT="/Users/gecko/src/lama"
ESP32_PROJECT="$PROJECT_ROOT/one.core/src/system/esp32/esp32-quicvc-project"

# ESP-IDF paths
IDF_PATH="/Users/gecko/esp/esp-idf"
IDF_PYTHON="/Users/gecko/.espressif/python_env/idf5.5_py3.12_env/bin/python"

# Check if project exists
if [ ! -d "$ESP32_PROJECT" ]; then
    echo "❌ Error: ESP32 project not found at $ESP32_PROJECT"
    exit 1
fi

cd "$ESP32_PROJECT"

# Source ESP-IDF environment
echo "📦 Setting up ESP-IDF environment..."
if [ -f "$IDF_PATH/export.sh" ]; then
    source "$IDF_PATH/export.sh" > /dev/null 2>&1
else
    echo "❌ Error: ESP-IDF not found at $IDF_PATH"
    exit 1
fi

# Build firmware
echo "🔨 Building firmware..."
echo ""
$IDF_PYTHON $IDF_PATH/tools/idf.py build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "✅ Build successful!"
echo ""

# Find connected ESP32 devices
echo "🔍 Looking for connected ESP32 devices..."
# Try multiple common ESP32 USB patterns
PORTS=$(ls /dev/cu.usbserial* /dev/tty.usbserial* /dev/cu.SLAB* /dev/tty.SLAB* /dev/cu.wchusbserial* /dev/tty.wchusbserial* /dev/cu.usbmodem* /dev/tty.usbmodem* 2>/dev/null || true)

if [ -z "$PORTS" ]; then
    echo "❌ No ESP32 devices found. Please connect your ESP32 via USB."
    echo ""
    echo "Tip: ESP32 devices usually appear as:"
    echo "  - /dev/cu.usbserial-XXX"
    echo "  - /dev/tty.usbserial-XXX"
    echo "  - /dev/cu.SLAB_USBtoUART"
    exit 1
fi

# Flash each connected device
for PORT in $PORTS; do
    echo ""
    echo "📡 Found device at $PORT"
    echo "⚡ Flashing firmware..."
    
    $IDF_PYTHON $IDF_PATH/tools/idf.py -p "$PORT" -b 921600 flash
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully flashed $PORT"
    else
        echo "⚠️  Failed to flash $PORT (device might be in use or incompatible)"
    fi
done

echo ""
echo "🎉 Flash process complete!"
echo ""
echo "The firmware includes:"
echo "  • QUICVC authentication protocol"
echo "  • HTML attestation discovery (service type 6)"
echo "  • Heartbeat support for claimed devices"
echo "  • LED control with ownership verification"
echo "  • Credential provisioning and removal"
echo ""
echo "To monitor device output:"
echo "  $IDF_PYTHON $IDF_PATH/tools/idf.py -p <PORT> monitor"