#!/usr/bin/env python3
import subprocess
import sys
import time

# Open serial port with cat
port = "/dev/cu.usbmodem1101"
print(f"Monitoring {port} for 10 seconds...")
print("Looking for display messages...")
print("-" * 40)

try:
    # Use stty to set baud rate and then cat to read
    subprocess.run(["stty", "-f", port, "115200"], check=False)
    
    # Read for 10 seconds
    proc = subprocess.Popen(["cat", port], stdout=subprocess.PIPE, text=True)
    
    start_time = time.time()
    while time.time() - start_time < 10:
        try:
            line = proc.stdout.readline()
            if line:
                print(line, end='')
                # Look for display-related messages
                if "display" in line.lower() or "ownership" in line.lower() or "uvc.one" in line.lower():
                    print(f">>> DISPLAY MESSAGE: {line.strip()}")
        except:
            pass
    
    proc.terminate()
    print("\n" + "-" * 40)
    print("Monitoring complete")
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)