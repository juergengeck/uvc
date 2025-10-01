#!/bin/bash
# Rebuild and flash ESP32 with increased buffer size

set -e

echo "=== Rebuilding and Flashing ESP32 Firmware ==="
echo ""
echo "Changes:"
echo "- Increased JSON_BUFFER_SIZE from 1024 to 2048 bytes"
echo "- This allows ESP32 to receive large ownership credentials"
echo ""

cd /Users/gecko/src/uvc/packages/one.core.expo/src/system/esp32/esp32-quicvc-project

echo "Building firmware..."
/Users/gecko/.espressif/python_env/idf5.5_py3.12_env/bin/python /Users/gecko/esp/esp-idf/tools/idf.py build

echo ""
echo "Flashing to ESP32 on /dev/cu.usbmodem1101..."
/Users/gecko/.espressif/python_env/idf5.5_py3.12_env/bin/python -m esptool \
  --chip esp32c3 \
  -p /dev/cu.usbmodem1101 \
  -b 460800 \
  --before default_reset \
  --after hard_reset \
  write_flash \
  --flash_mode dio \
  --flash_freq 80m \
  --flash_size 2MB \
  0x10000 build/esp32_quicvc_app.bin

echo ""
echo "✅ Firmware flashed successfully!"
echo ""
echo "The ESP32 will now reboot. You can monitor it with:"
echo "  ./debug-esp32-claim.sh"
