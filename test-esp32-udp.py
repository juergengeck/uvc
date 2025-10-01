#!/usr/bin/env python3
"""Test if ESP32 is receiving UDP packets on port 49497"""

import socket
import json
import time

ESP32_IP = "192.168.178.100"
ESP32_PORT = 49497

# Create UDP socket
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(5)

print(f"Testing UDP communication with ESP32 at {ESP32_IP}:{ESP32_PORT}")
print()

# Test 1: Send service type 2 (credentials) packet
print("Test 1: Sending minimal service type 2 packet...")
test_message = {
    "type": "test_credential",
    "message": "Hello from Python test script"
}
packet = bytes([2]) + json.dumps(test_message).encode('utf-8')
print(f"Sending {len(packet)} bytes")
sock.sendto(packet, (ESP32_IP, ESP32_PORT))

# Wait for response
try:
    data, addr = sock.recvfrom(4096)
    print(f"✅ Received response ({len(data)} bytes) from {addr}")
    print(f"Response: {data[:100]}")
except socket.timeout:
    print("❌ No response received (timeout)")

print()

# Test 2: Send service type 1 (discovery) packet
print("Test 2: Sending service type 1 (discovery) packet...")
discovery_packet = bytes([1]) + b"test discovery"
sock.sendto(discovery_packet, (ESP32_IP, ESP32_PORT))

try:
    data, addr = sock.recvfrom(4096)
    print(f"✅ Received response ({len(data)} bytes) from {addr}")
    print(f"Response: {data[:100]}")
except socket.timeout:
    print("❌ No response received (timeout)")

sock.close()
print()
print("Test complete. Check ESP32 serial output for logs.")
