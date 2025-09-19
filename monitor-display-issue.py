#!/usr/bin/env python3
import serial
import sys
import time

port = '/dev/cu.usbmodem1101'
baudrate = 115200

print(f"Monitoring {port} for display issues...")
try:
    ser = serial.Serial(port, baudrate, timeout=1)
    print("Connected! Looking for display-related messages...\n")
    
    # Reset the device
    ser.setDTR(False)
    time.sleep(0.1)
    ser.setDTR(True)
    
    start_time = time.time()
    while time.time() - start_time < 20:  # Monitor for 20 seconds
        if ser.in_waiting:
            data = ser.read(ser.in_waiting)
            try:
                text = data.decode('utf-8', errors='replace')
                # Show all lines that contain display, Display, task, or app_main
                for line in text.split('\n'):
                    if any(keyword in line.lower() for keyword in ['display', 'task', 'app_main', 'created', 'i2c', 'oled', '📺']):
                        print(line)
            except:
                pass
        time.sleep(0.01)
    
    ser.close()
    print("\n\nMonitoring complete.")
    
except serial.SerialException as e:
    print(f"Error: {e}")
    sys.exit(1)