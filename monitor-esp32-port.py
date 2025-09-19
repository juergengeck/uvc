#!/usr/bin/env python3
import serial
import time
import sys

port = '/dev/cu.wchusbserial10'
baudrate = 115200

print(f"Monitoring ESP32 on {port} at {baudrate} baud...")
print("Looking for port 49497 messages...")
print("-" * 50)

try:
    ser = serial.Serial(port, baudrate, timeout=1)
    start_time = time.time()
    
    while time.time() - start_time < 30:  # Monitor for 30 seconds
        if ser.in_waiting:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if line:
                # Always print lines containing key information
                if any(keyword in line for keyword in ['49497', 'port', 'socket', 'Unified', 'service', 'Discovery', 'bound']):
                    print(f"[{time.strftime('%H:%M:%S')}] {line}")
                    
                    # Check for our specific success message
                    if 'Unified service task started on port 49497' in line:
                        print("\n✅ SUCCESS: ESP32 is using fixed port 49497!")
                    elif 'Discovery socket bound to port 49497' in line:
                        print("\n✅ SUCCESS: Discovery socket bound to fixed port!")
                        
except KeyboardInterrupt:
    print("\nMonitoring stopped.")
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'ser' in locals():
        ser.close()
    print("\nDone monitoring.")