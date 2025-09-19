/**
 * UDP Example Component
 * 
 * A simple example component that demonstrates UDP functionality
 * with proper error handling and resource cleanup.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Button, TextInput, StyleSheet, ScrollView } from 'react-native';
import * as udp from '../platform/udp';
import type { UdpSocket } from '../models/network/UdpModel';

export const UdpExample: React.FC = () => {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [socket, setSocket] = useState<UdpSocket | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [port, setPort] = useState('44444');
  const [message, setMessage] = useState('Hello UDP!');
  const [targetIp, setTargetIp] = useState('127.0.0.1');

  const addLog = useCallback((log: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${log}`]);
  }, []);

  // Check UDP support on mount
  useEffect(() => {
    const checkSupport = async () => {
      try {
        const supported = await udp.isUdpSupported();
        setIsSupported(supported);
        addLog(`UDP support: ${supported ? 'Available' : 'Not available'}`);
        
        // Also check capabilities
        const capabilities = await udp.getUdpCapabilities();
        addLog(`Capabilities: ${JSON.stringify(capabilities)}`);
      } catch (error) {
        addLog(`Error checking UDP support: ${error instanceof Error ? error.message : String(error)}`);
        setIsSupported(false);
      }
    };
    
    checkSupport();
    
    // Clean up on unmount
    return () => {
      if (socket) {
        socket.close().catch(console.error);
      }
    };
  }, [addLog]);

  // Start listening for UDP messages
  const startListening = async () => {
    if (socket) {
      addLog('Already listening. Stop first.');
      return;
    }
    
    try {
      addLog('Creating UDP socket...');
      const newSocket = await udp.createSocket({
        type: 'udp4',
        reuseAddr: true
      });
      
      // Set up message handler
      newSocket.on('message', (data, rinfo) => {
        let messageStr: string;
        if (data instanceof Uint8Array) {
          messageStr = new TextDecoder().decode(data);
        } else {
          messageStr = data.toString();
        }
        
        addLog(`Received: "${messageStr}" from ${rinfo.address}:${rinfo.port}`);
      });
      
      newSocket.on('error', (err) => {
        addLog(`Socket error: ${err.message}`);
      });
      
      // Bind to port
      const portNum = parseInt(port, 10);
      addLog(`Binding to port ${portNum}...`);
      await newSocket.bind(portNum);
      addLog(`Listening on port ${portNum}`);
      
      setSocket(newSocket);
      setIsListening(true);
    } catch (error) {
      addLog(`Error starting listener: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Stop listening
  const stopListening = async () => {
    if (!socket) {
      addLog('No active socket.');
      return;
    }
    
    try {
      addLog('Closing socket...');
      await socket.close();
      addLog('Socket closed');
      
      setSocket(null);
      setIsListening(false);
    } catch (error) {
      addLog(`Error closing socket: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Send a UDP message
  const sendMessage = async () => {
    try {
      const portNum = parseInt(port, 10);
      addLog(`Sending "${message}" to ${targetIp}:${portNum}...`);
      
      const senderSocket = await udp.createSocket({ type: 'udp4' });
      await senderSocket.send(message, portNum, targetIp);
      addLog('Message sent');
      
      // Close the sender socket
      await senderSocket.close();
    } catch (error) {
      addLog(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Send broadcast
  const sendBroadcast = async () => {
    try {
      const portNum = parseInt(port, 10);
      addLog(`Broadcasting "${message}" on port ${portNum}...`);
      
      await udp.sendBroadcast(message, portNum);
      addLog('Broadcast sent');
    } catch (error) {
      addLog(`Error broadcasting: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };

  if (isSupported === null) {
    return (
      <View style={styles.container}>
        <Text>Checking UDP support...</Text>
      </View>
    );
  }

  if (isSupported === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>UDP is not supported on this device</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>UDP Example</Text>
      
      <View style={styles.inputGroup}>
        <Text>Port:</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          keyboardType="numeric"
        />
      </View>
      
      <View style={styles.buttonRow}>
        {!isListening ? (
          <Button title="Start Listening" onPress={startListening} />
        ) : (
          <Button title="Stop Listening" onPress={stopListening} color="#cc0000" />
        )}
      </View>
      
      <View style={styles.inputGroup}>
        <Text>Message:</Text>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text>Target IP:</Text>
        <TextInput
          style={styles.input}
          value={targetIp}
          onChangeText={setTargetIp}
        />
      </View>
      
      <View style={styles.buttonRow}>
        <Button title="Send Message" onPress={sendMessage} />
        <View style={styles.buttonSpacer} />
        <Button title="Send Broadcast" onPress={sendBroadcast} />
      </View>
      
      <View style={styles.logContainer}>
        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Logs</Text>
          <Button title="Clear" onPress={clearLogs} />
        </View>
        
        <ScrollView style={styles.logScroll}>
          {logs.map((log, index) => (
            <Text key={index} style={styles.logText}>{log}</Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 12,
  },
  input: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    backgroundColor: 'white',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonSpacer: {
    width: 16,
  },
  logContainer: {
    flex: 1,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    backgroundColor: 'white',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    padding: 8,
  },
  logTitle: {
    fontWeight: 'bold',
  },
  logScroll: {
    flex: 1,
    padding: 8,
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 16,
  },
});

export default UdpExample; 