#!/usr/bin/env python3
"""
Monitor UDP traffic on port 49497 to identify 4-byte packets
Run with: sudo python3 monitor-udp-49497.py
"""

import socket
import struct
import time
from datetime import datetime

def monitor_udp_broadcast():
    # Create UDP socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    
    # Bind to the broadcast port
    sock.bind(('', 49497))
    
    print(f"Monitoring UDP port 49497 for packets...")
    print("=" * 60)
    
    packet_count = {}
    
    try:
        while True:
            data, addr = sock.recvfrom(1024)
            timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            
            # Track packet sizes
            size = len(data)
            if size not in packet_count:
                packet_count[size] = 0
            packet_count[size] += 1
            
            # Detailed logging for small packets
            if size <= 10:
                print(f"\n[{timestamp}] SMALL PACKET from {addr[0]}:{addr[1]}")
                print(f"  Size: {size} bytes")
                print(f"  Hex: {' '.join(f'{b:02x}' for b in data)}")
                print(f"  Decimal: {list(data)}")
                print(f"  ASCII: {''.join(chr(b) if 32 <= b < 127 else '.' for b in data)}")
                
                # Try to identify the packet type
                if size == 4:
                    # Check for common patterns
                    if data == b'\x00\x00\x00\x00':
                        print("  Type: Four zeros (possible probe/keepalive)")
                    elif data == b'\xff\xff\xff\xff':
                        print("  Type: Four 0xFF (possible broadcast marker)")
                    elif data == b'ping':
                        print("  Type: ASCII 'ping'")
                    elif data == b'PING':
                        print("  Type: ASCII 'PING'")
                    else:
                        # Try to interpret as different formats
                        try:
                            as_int = struct.unpack('>I', data)[0]  # Big-endian uint32
                            print(f"  As uint32 (BE): {as_int}")
                            as_int_le = struct.unpack('<I', data)[0]  # Little-endian uint32
                            print(f"  As uint32 (LE): {as_int_le}")
                        except:
                            pass
            else:
                # Brief logging for normal packets
                if size == 186:
                    print(f"[{timestamp}] Discovery packet from {addr[0]} (186 bytes)")
                elif size == 225:
                    print(f"[{timestamp}] Extended discovery from {addr[0]} (225 bytes)")
                else:
                    print(f"[{timestamp}] Packet from {addr[0]}:{addr[1]} ({size} bytes)")
            
            # Periodic summary
            if sum(packet_count.values()) % 20 == 0:
                print(f"\n--- Summary: {packet_count} ---\n")
                
    except KeyboardInterrupt:
        print("\n\nFinal packet count summary:")
        for size, count in sorted(packet_count.items()):
            print(f"  {size} bytes: {count} packets")
    finally:
        sock.close()

if __name__ == "__main__":
    monitor_udp_broadcast()