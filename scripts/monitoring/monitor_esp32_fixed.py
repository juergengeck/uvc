#!/usr/bin/env python3

import serial
import sys
import time

# Configuration
port = '/dev/cu.usbserial-110'
baudrate = 115200

try:
    # Open serial connection
    ser = serial.Serial(port, baudrate, timeout=1)
    print(f"Connected to {port} at {baudrate} baud")
    print("=" * 60)
    
    # Monitor serial output
    while True:
        if ser.in_waiting > 0:
            data = ser.readline()
            try:
                # Try to decode as UTF-8
                text = data.decode('utf-8').strip()
                if text:
                    # Add timestamp
                    timestamp = time.strftime("%H:%M:%S")
                    print(f"[{timestamp}] {text}")
                    
                    # Check for watchdog reset
                    if "TG1WDT_SYS_RESET" in text:
                        print("\n*** WATCHDOG RESET DETECTED! ***\n")
                    elif "POWERON_RESET" in text:
                        print("\n*** POWER ON RESET ***\n")
                        
            except UnicodeDecodeError:
                # Print raw hex if can't decode
                print(f"RAW: {data.hex()}")
                
except serial.SerialException as e:
    print(f"Error: {e}")
except KeyboardInterrupt:
    print("\nExiting...")
finally:
    if 'ser' in locals() and ser.is_open:
        ser.close()
        print("Serial port closed")