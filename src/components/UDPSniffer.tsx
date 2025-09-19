import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView
} from 'react-native';
import { createSocket } from '../platform/udp';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';

interface Packet {
  id: number;
  timestamp: number;
  address: string;
  port: number;
  data: string;
  hexData: string;
  length: number;
}

/**
 * Simple UDP Sniffer that displays all packets received on port 49497
 * (the designated port for QUIC protocol communication)
 */
export const UDPSniffer: React.FC = () => {
  const [listening, setListening] = useState(false);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<any>(null);
  const packetIdCounter = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const toggleListener = async () => {
    if (listening) {
      // Stop listening
      try {
        if (socketRef.current) {
          console.log('Closing UDP socket...');
          await socketRef.current.close();
          socketRef.current = null;
        }
        setListening(false);
      } catch (err) {
        console.error('Error closing socket:', err);
        setError(`Failed to close socket: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // Start listening
      try {
        setError(null);
        console.log('Creating UDP socket...');
        
        const socket = await createSocket({ 
          type: 'udp4', 
          debug: true,
          reuseAddr: true,
          debugLabel: 'UDPSniffer'
        });
        
        socketRef.current = socket;
        
        // Add message listener that records everything
        socket.addListener('message', (message: Uint8Array, rinfo: { address: string; port: number }) => {
          console.log(`PACKET: ${rinfo.address}:${rinfo.port} (${message.length} bytes)`);
          
          try {
            // Convert to string and hex for display
            const stringData = new TextDecoder().decode(message).replace(/[^\x20-\x7E]/g, '.');
            
            // Convert to hex string for viewing binary data
            const hexData = Array.from(message.slice(0, Math.min(128, message.length)))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' ');
            
            // Add packet to our list
            const newPacket: Packet = {
              id: packetIdCounter.current++,
              timestamp: Date.now(),
              address: rinfo.address,
              port: rinfo.port,
              data: stringData.substring(0, 200),
              hexData,
              length: message.length
            };
            
            setPackets(prev => {
              // Keep only last 100 packets to avoid memory issues
              const newPackets = [newPacket, ...prev].slice(0, 100);
              return newPackets;
            });
          } catch (err) {
            console.error('Error processing packet:', err);
          }
        });
        
        // Add error listener
        socket.addListener('error', (err: Error) => {
          console.error('Socket error:', err);
          setError(`Socket error: ${err.message}`);
        });
        
        // Bind to port
        console.log('Binding to port 49497 (QUIC protocol port)...');
        try {
          await socket.bind(49497, '0.0.0.0');
          console.log('Successfully bound to port 49497 (QUIC protocol port)');
        } catch (err) {
          console.error('Failed to bind:', err);
          throw err;
        }
        
        // Enable broadcast
        try {
          await socket.setBroadcast(true);
          console.log('Broadcast enabled');
        } catch (err) {
          console.error('Failed to set broadcast:', err);
          // Non-fatal, continue
        }
        
        setListening(true);
        console.log('UDP Sniffer started');
        
      } catch (err) {
        console.error('Error starting UDP sniffer:', err);
        setError(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
        
        // Cleanup
        if (socketRef.current) {
          try {
            socketRef.current.close();
          } catch (e) {
            console.error('Error closing socket after failure:', e);
          }
          socketRef.current = null;
        }
      }
    }
  };
  
  const clearPackets = () => {
    setPackets([]);
    packetIdCounter.current = 0;
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (e) {
          console.error('Error closing socket on unmount:', e);
        }
      }
    };
  }, []);
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>UDP Sniffer (QUIC Protocol Port 49497)</Text>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.button, listening ? styles.stopButton : styles.startButton]} 
            onPress={toggleListener}
          >
            <Text style={styles.buttonText}>
              {listening ? '⏹️ Stop' : '▶️ Start'} Listening
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.clearButton]} 
            onPress={clearPackets}
          >
            <Text style={styles.buttonText}>Clear</Text>
          </TouchableOpacity>
        </View>
        
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            Status: <Text style={listening ? styles.activeText : styles.inactiveText}>
              {listening ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </Text>
          <Text style={styles.statsText}>Packets: {packets.length}</Text>
        </View>
      </View>
      
      <ScrollView 
        style={styles.packetList}
        ref={scrollViewRef}
        onContentSizeChange={() => {
          if (packets.length > 0) {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }
        }}
      >
        {packets.length === 0 ? (
          <Text style={styles.emptyText}>No packets received yet</Text>
        ) : (
          packets.map((packet) => (
            <View key={packet.id} style={styles.packetItem}>
              <View style={styles.packetHeader}>
                <Text style={styles.packetTitle}>
                  #{packet.id} - {new Date(packet.timestamp).toLocaleTimeString()}
                </Text>
                <Text style={styles.packetSource}>
                  {packet.address}:{packet.port} ({packet.length} bytes)
                </Text>
              </View>
              
              <View style={styles.packetData}>
                <Text style={styles.dataLabel}>ASCII:</Text>
                <Text style={styles.dataContent}>{packet.data}</Text>
              </View>
              
              <View style={styles.packetData}>
                <Text style={styles.dataLabel}>HEX:</Text>
                <Text style={styles.dataContent}>{packet.hexData}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2c3e50',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#34495e',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ecf0f1',
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginRight: 10,
  },
  startButton: {
    backgroundColor: '#27ae60',
  },
  stopButton: {
    backgroundColor: '#e74c3c',
  },
  clearButton: {
    backgroundColor: '#7f8c8d',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#ffcccc',
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  errorText: {
    color: '#d63031',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsText: {
    color: '#bdc3c7',
  },
  activeText: {
    color: '#2ecc71',
    fontWeight: 'bold',
  },
  inactiveText: {
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  packetList: {
    flex: 1,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 30,
    color: '#7f8c8d',
    fontStyle: 'italic',
  },
  packetItem: {
    backgroundColor: '#ffffff',
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  packetHeader: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
    paddingBottom: 8,
  },
  packetTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#2c3e50',
  },
  packetSource: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  packetData: {
    marginTop: 6,
  },
  dataLabel: {
    fontWeight: 'bold',
    color: '#34495e',
    fontSize: 12,
    marginBottom: 2,
  },
  dataContent: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#2c3e50',
    backgroundColor: '#f9f9f9',
    padding: 6,
    borderRadius: 4,
  },
}); 