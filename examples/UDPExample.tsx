import React, { useState, useEffect } from 'react';
import { View, Text, Button, TextInput, StyleSheet, ScrollView } from 'react-native';
import UDPDirectModule from '../src/UDPDirectModule';

/**
 * UDP Direct Module Example
 * 
 * This component demonstrates how to use the high-performance UDPDirectModule
 * for direct buffer access and UDP networking.
 */
const UDPExample: React.FC = () => {
  const [socketId, setSocketId] = useState<number | null>(null);
  const [buffer, setBuffer] = useState<any | null>(null);
  const [port, setPort] = useState('8080');
  const [address, setAddress] = useState('127.0.0.1');
  const [message, setMessage] = useState('Hello, UDP!');
  const [log, setLog] = useState<string[]>([]);

  // Add log entries with timestamps
  const addLog = (entry: string) => {
    const timestamp = new Date().toISOString().substr(11, 8);
    setLog(prev => [`[${timestamp}] ${entry}`, ...prev].slice(0, 100));
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  // Clean up socket and buffer
  const cleanupResources = async () => {
    try {
      if (socketId !== null) {
        addLog(`Closing socket ${socketId}...`);
        await UDPDirectModule.closeSocket(socketId);
        setSocketId(null);
      }
      
      if (buffer !== null) {
        addLog('Releasing buffer...');
        UDPDirectModule.releaseDirectBuffer(buffer);
        setBuffer(null);
      }
    } catch (error) {
      addLog(`Cleanup error: ${error}`);
    }
  };

  // Create a UDP socket
  const createSocket = async () => {
    try {
      addLog('Creating UDP socket...');
      const newSocketId = await UDPDirectModule.createSocket({
        broadcast: true
      });
      setSocketId(newSocketId);
      addLog(`Socket created with ID: ${newSocketId}`);
      
      // Bind to port
      const bindResult = await UDPDirectModule.bind(newSocketId, parseInt(port, 10), '0.0.0.0');
      addLog(`Socket bind result: ${bindResult ? 'success' : 'failed'}`);
    } catch (error) {
      addLog(`Socket creation error: ${error}`);
    }
  };

  // Create a buffer for sending data
  const createBuffer = () => {
    try {
      addLog('Creating direct buffer...');
      const newBuffer = UDPDirectModule.createDirectBuffer(1024);
      setBuffer(newBuffer);
      addLog('Direct buffer created');
      return newBuffer;
    } catch (error) {
      addLog(`Buffer creation error: ${error}`);
      return null;
    }
  };

  // Send a message using UDP
  const sendMessage = async () => {
    if (socketId === null) {
      addLog('Error: No socket available. Create a socket first.');
      return;
    }
    
    let currentBuffer = buffer;
    if (currentBuffer === null) {
      currentBuffer = createBuffer();
      if (currentBuffer === null) return;
    }
    
    try {
      // Get the buffer ID from the host object
      const bufferId = (currentBuffer as any).bufferId;
      
      // Write the message to the buffer
      // In a real implementation, you would use a method like:
      // await UDPDirectModule.writeToSharedArrayBuffer(bufferId, message, 0);
      
      // For now, simulate writing the message
      addLog(`Writing message to buffer: "${message}"`);
      
      // Send the message via UDP
      addLog(`Sending message to ${address}:${port}...`);
      const bytesSent = await UDPDirectModule.sendFromArrayBuffer(
        socketId,
        bufferId,
        0, // offset
        message.length, // length
        parseInt(port, 10),
        address
      );
      
      addLog(`Sent ${bytesSent} bytes`);
    } catch (error) {
      addLog(`Send error: ${error}`);
    }
  };

  // Get diagnostics about the UDP module
  const getDiagnostics = async () => {
    try {
      addLog('Getting diagnostics...');
      const diagnostics = await UDPDirectModule.getDiagnostics();
      addLog(`Diagnostics: ${JSON.stringify(diagnostics)}`);
    } catch (error) {
      addLog(`Diagnostics error: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>UDP Direct Module Example</Text>
      
      <View style={styles.inputGroup}>
        <Text>Local Port:</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          keyboardType="number-pad"
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text>Target Address:</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
        />
      </View>
      
      <View style={styles.inputGroup}>
        <Text>Message:</Text>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
        />
      </View>
      
      <View style={styles.buttonRow}>
        <Button
          title={socketId === null ? "Create Socket" : `Socket ID: ${socketId}`}
          onPress={createSocket}
          disabled={socketId !== null}
        />
        
        <Button
          title={buffer === null ? "Create Buffer" : "Buffer Created"}
          onPress={createBuffer}
          disabled={buffer !== null}
        />
      </View>
      
      <View style={styles.buttonRow}>
        <Button
          title="Send Message"
          onPress={sendMessage}
          disabled={socketId === null}
        />
        
        <Button
          title="Get Diagnostics"
          onPress={getDiagnostics}
        />
      </View>
      
      <Button
        title="Clean Up Resources"
        onPress={cleanupResources}
        color="#ff3b30"
      />
      
      <Text style={styles.logTitle}>Log:</Text>
      <ScrollView style={styles.logContainer}>
        {log.map((entry, index) => (
          <Text key={index} style={styles.logEntry}>{entry}</Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  logTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  logContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#f9f9f9',
  },
  logEntry: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
});

export default UDPExample; 