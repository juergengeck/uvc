#!/bin/bash

# Simple ESP32 serial monitor
echo "Starting ESP32 monitor on /dev/cu.usbmodem1101..."
echo "Press Ctrl+C to exit"
echo "-----------------------------------"

# Use screen for interactive serial monitoring
screen /dev/cu.usbmodem1101 115200