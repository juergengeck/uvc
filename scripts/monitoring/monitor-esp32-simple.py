#!/usr/bin/env python3
"""Simple ESP32 serial monitor"""
import serial
import sys

if len(sys.argv) != 2:
    print("Usage: python monitor-esp32-simple.py /dev/cu.usbserial-XXX")
    sys.exit(1)

port = sys.argv[1]
print(f"Opening serial port {port} at 115200 baud...")

try:
    ser = serial.Serial(port, 115200, timeout=0.1)
    print("Serial port opened. Monitoring ESP32 output...")
    print("Press Ctrl+C to exit\n")
    
    while True:
        data = ser.readline()
        if data:
            try:
                text = data.decode('utf-8').strip()
                if text:
                    print(text)
            except UnicodeDecodeError:
                print(f"[Binary data: {data.hex()}]")
                
except KeyboardInterrupt:
    print("\nExiting...")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)