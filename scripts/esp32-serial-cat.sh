#!/bin/bash

# Simple ESP32 Serial Monitor using cat
# Displays ESP32 serial output directly in terminal

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 ESP32 Serial Monitor (Direct Output)${NC}"
echo -e "${BLUE}======================================${NC}"

# Detect ESP32 device
DEVICE=""
if [ -e "/dev/tty.usbserial-110" ]; then
    DEVICE="/dev/tty.usbserial-110"
elif [ -e "/dev/tty.wchusbserial110" ]; then
    DEVICE="/dev/tty.wchusbserial110"
else
    echo -e "${RED}❌ No ESP32 device found${NC}"
    echo -e "${YELLOW}Available devices:${NC}"
    ls /dev/tty.* | grep -E "(usb|serial)" | head -5
    exit 1
fi

echo -e "${GREEN}✅ Using device: $DEVICE${NC}"
echo -e "${YELLOW}📡 Monitoring ESP32 serial output... (Press Ctrl+C to stop)${NC}"
echo -e "${BLUE}===========================================${NC}"

# Configure serial port settings for ESP32
stty -f "$DEVICE" 115200 cs8 -cstopb -parenb raw

# Monitor the serial port
cat "$DEVICE" 