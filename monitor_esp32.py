#!/usr/bin/env python3
import serial
import time
import sys

port = '/dev/cu.wchusbserial110'
baudrate = 115200

print(f"Opening serial port {port} at {baudrate} baud...")

try:
    with serial.Serial(port, baudrate, timeout=1) as ser:
        print("Serial port opened. Monitoring ESP32 output...")
        print("Press Ctrl+C to exit\n")
        
        # Clear any buffered data
        ser.reset_input_buffer()
        
        while True:
            if ser.in_waiting > 0:
                try:
                    line = ser.readline()
                    if line:
                        # Try to decode as UTF-8, fallback to latin-1
                        try:
                            decoded = line.decode('utf-8').rstrip()
                        except UnicodeDecodeError:
                            decoded = line.decode('latin-1').rstrip()
                        
                        if decoded:
                            print(decoded)
                            sys.stdout.flush()
                except Exception as e:
                    print(f"Error reading line: {e}")
                    
except serial.SerialException as e:
    print(f"Error opening serial port: {e}")
except KeyboardInterrupt:
    print("\nExiting...")