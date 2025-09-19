#!/usr/bin/env python3
import subprocess
import time
import sys

# First, capture initial boot
print("=" * 60)
print("ESP32 State Reset Test")
print("=" * 60)
print("\n📋 Testing state reset on reboot...")
print("\n1. Initial boot - device should start UNCLAIMED")
print("   Looking for: '🔄 Resetting device state on boot'")
print("   Looking for: '🔓 Device is unclaimed (fresh boot)'")
print("=" * 60 + "\n")

# Use pyserial from ESP-IDF environment
cmd = [
    '/Users/gecko/.espressif/python_env/idf5.5_py3.12_env/bin/python',
    '-c',
    '''
import serial
import time

try:
    ser = serial.Serial('/dev/cu.usbmodem1101', 115200, timeout=1)
    print("✅ Connected to ESP32")
    
    # Reset the device
    ser.setDTR(False)
    time.sleep(0.1)
    ser.setRTS(True)
    time.sleep(0.1)
    ser.setDTR(True)
    ser.setRTS(False)
    time.sleep(0.5)
    
    print("🔄 Device reset triggered, monitoring boot...")
    print("-" * 60)
    
    start_time = time.time()
    state_reset_found = False
    unclaimed_found = False
    
    while time.time() - start_time < 15:
        if ser.in_waiting:
            line = ser.readline()
            try:
                decoded = line.decode('utf-8', errors='ignore').strip()
                if decoded:
                    print(decoded)
                    
                    # Check for state reset confirmation
                    if "Resetting device state on boot" in decoded:
                        state_reset_found = True
                        print(">>> ✅ STATE RESET DETECTED!")
                    
                    if "Device is unclaimed (fresh boot)" in decoded:
                        unclaimed_found = True
                        print(">>> ✅ DEVICE STARTS UNCLAIMED!")
                    
                    if "ESP32 QUICVC Native initialized successfully" in decoded:
                        break
            except:
                pass
    
    print("-" * 60)
    print("\\n📊 Test Results:")
    if state_reset_found:
        print("✅ State reset on boot: WORKING")
    else:
        print("❌ State reset on boot: NOT DETECTED")
    
    if unclaimed_found:
        print("✅ Device starts unclaimed: CONFIRMED")
    else:
        print("❌ Device starts unclaimed: NOT CONFIRMED")
    
    ser.close()
    
except Exception as e:
    print(f"Error: {e}")
'''
]

subprocess.run(cmd)

print("\n" + "=" * 60)
print("Test complete!")
print("The ESP32 should now reset its state on every reboot.")
print("Ownership is only stored in memory and cleared on power cycle.")
print("=" * 60)