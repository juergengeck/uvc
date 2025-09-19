#!/bin/bash

# ESP32 Serial Monitor Script
# Monitors the ESP32 serial interface for debugging and development

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 ESP32 Serial Monitor${NC}"
echo -e "${BLUE}=====================${NC}"

# Common ESP32 serial devices on macOS
POSSIBLE_DEVICES=(
    "/dev/tty.usbserial-110"
    "/dev/tty.wchusbserial110"
    "/dev/tty.SLAB_USBtoUART"
    "/dev/tty.usbserial-0001"
    "/dev/tty.wchusbserial1410"
)

# Common ESP32 baud rates
BAUD_RATES=(115200 9600 74880 460800)

# Function to detect ESP32 device
detect_esp32_device() {
    echo -e "${YELLOW}🔍 Detecting ESP32 device...${NC}"
    
    for device in "${POSSIBLE_DEVICES[@]}"; do
        if [ -e "$device" ]; then
            echo -e "${GREEN}✅ Found device: $device${NC}"
            echo "$device"
            return 0
        fi
    done
    
    echo -e "${RED}❌ No ESP32 device found${NC}"
    echo -e "${YELLOW}Available serial devices:${NC}"
    ls /dev/tty.* 2>/dev/null | head -10
    return 1
}

# Function to start monitoring
start_monitoring() {
    local device=$1
    local baud=${2:-115200}
    
    echo -e "${GREEN}🚀 Starting serial monitor on $device at $baud baud${NC}"
    echo -e "${YELLOW}Press Ctrl+A then K to exit, or Ctrl+A then D to detach${NC}"
    echo -e "${BLUE}===========================================${NC}"
    
    # Use screen to monitor the serial port
    screen "$device" "$baud"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [device] [baud_rate]"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Auto-detect device, use 115200 baud"
    echo "  $0 /dev/tty.usbserial-110            # Specific device, 115200 baud"
    echo "  $0 /dev/tty.usbserial-110 9600       # Specific device and baud rate"
    echo ""
    echo "Common ESP32 baud rates: 115200, 9600, 74880, 460800"
}

# Main script logic
main() {
    local device=""
    local baud=115200
    
    # Parse arguments
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
        exit 0
    fi
    
    if [ -n "$1" ]; then
        device="$1"
        if [ ! -e "$device" ]; then
            echo -e "${RED}❌ Device $device not found${NC}"
            exit 1
        fi
    else
        device=$(detect_esp32_device)
        if [ $? -ne 0 ]; then
            exit 1
        fi
    fi
    
    if [ -n "$2" ]; then
        baud="$2"
    fi
    
    # Check if screen is available
    if ! command -v screen &> /dev/null; then
        echo -e "${RED}❌ 'screen' command not found. Please install it first.${NC}"
        exit 1
    fi
    
    # Start monitoring
    start_monitoring "$device" "$baud"
}

# Run main function with all arguments
main "$@" 