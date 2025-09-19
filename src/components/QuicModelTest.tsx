/**
 * QuicModelTest Component
 * 
 * A simple React Native component that allows users to test the QuicModel
 * functionality, including UDP socket creation and basic operations.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Button, Divider } from 'react-native-paper';
import { QuicModel } from '../models/network/QuicModel';

interface TestLogEntry {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  timestamp: number;
}

/**
 * QuicModelTest component for testing QuicModel functionality
 */
export const QuicModelTest: React.FC = () => {
  const [logs, setLogs] = useState<TestLogEntry[]>([]);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [socket, setSocket] = useState<any>(null);
  const [listenPort, setListenPort] = useState<number | null>(null);

  // Log a message to the UI
  const logMessage = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    console.log(`[QuicModelTest] ${message}`);
    setLogs(prev => [...prev, { 
      message, 
      type, 
      timestamp: Date.now() 
    }]);
  };

  // Run the QuicModel initialization test
  const runInitTest = async () => {
    setIsRunningTest(true);
    setLogs([]);
    
    try {
      logMessage('Starting QuicModel initialization test...', 'info');
      
      // Get QuicModel instance
      const quicModel = QuicModel.getInstance();
      logMessage('QuicModel instance obtained', 'success');
      
      // Check if already initialized
      const isInitialized = quicModel.isInitialized();
      logMessage(`QuicModel initialization state: ${isInitialized ? 'Initialized' : 'Not initialized'}`, 
                isInitialized ? 'success' : 'warning');
      
      // Check if ready
      const isReady = quicModel.isReady();
      logMessage(`QuicModel ready state: ${isReady ? 'Ready' : 'Not ready'}`,
                isReady ? 'success' : 'warning');
      
      // Initialize if needed
      if (!isInitialized || !isReady) {
        logMessage('Attempting to initialize QuicModel...', 'info');
        await quicModel.init();
        
        // Check again after initialization
        const nowInitialized = quicModel.isInitialized();
        const nowReady = quicModel.isReady();
        
        logMessage(`QuicModel initialization state after init(): ${nowInitialized ? 'Initialized' : 'Still not initialized'}`,
                  nowInitialized ? 'success' : 'error');
        logMessage(`QuicModel ready state after init(): ${nowReady ? 'Ready' : 'Still not ready'}`,
                  nowReady ? 'success' : 'error');
      }
      
      logMessage('QuicModel initialization test completed successfully', 'success');
    } catch (error) {
      logMessage(`Error during QuicModel initialization test: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsRunningTest(false);
    }
  };

  // Test creating a UDP socket
  const testCreateSocket = async () => {
    setIsRunningTest(true);
    
    try {
      logMessage('Testing UDP socket creation...', 'info');
      
      // Get QuicModel instance
      const quicModel = QuicModel.getInstance();
      
      // Get UdpModel
      const udpModel = quicModel.getUdpModel();
      if (!udpModel) {
        throw new Error('UdpModel not available');
      }
      
      logMessage('UdpModel available', 'success');
      
      // Create a socket
      const testSocket = await udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        broadcast: true,
        debug: true,
        debugLabel: 'quick-test-socket'
      });
      
      if (!testSocket) {
        throw new Error('Failed to create UDP socket');
      }
      
      logMessage(`UDP socket created successfully (ID: ${testSocket.id})`, 'success');
      setSocket(testSocket);
      
      // Setup message handler
      testSocket.on('message', (msg: any, rinfo: any) => {
        const dataStr = msg.toString('utf8');
        logMessage(`📦 RECEIVED: ${dataStr.length > 100 ? dataStr.substring(0, 100) + '...' : dataStr}`, 'info');
        logMessage(`From: ${rinfo.address}:${rinfo.port}`, 'info');
      });
      
      testSocket.on('error', (err: any) => {
        logMessage(`Socket error: ${err}`, 'error');
      });
      
      logMessage('UDP socket created and event handlers attached', 'success');
    } catch (error) {
      logMessage(`Error creating UDP socket: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsRunningTest(false);
    }
  };

  // Bind the socket to a port
  const bindSocket = async () => {
    if (!socket) {
      logMessage('No socket available. Create a socket first.', 'error');
      return;
    }
    
    setIsRunningTest(true);
    
    try {
      // Generate a random port between 50000 and 65000
      const port = Math.floor(Math.random() * 15000) + 50000;
      logMessage(`Binding socket to port ${port}...`, 'info');
      
      await socket.bind(port);
      setListenPort(port);
      
      logMessage(`Socket bound to port ${port} successfully`, 'success');
    } catch (error) {
      logMessage(`Error binding socket: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsRunningTest(false);
    }
  };

  // Send a test message
  const sendTestMessage = async () => {
    if (!socket) {
      logMessage('No socket available. Create a socket first.', 'error');
      return;
    }
    
    setIsRunningTest(true);
    
    try {
      const testMessage = JSON.stringify({
        type: 'test',
        message: 'Hello UDP!',
        timestamp: Date.now()
      });
      
      logMessage('Sending test message...', 'info');
      
      // Send to broadcast address on port 49497 (our QUIC protocol port)
      await socket.send(testMessage, 49497, '255.255.255.255');
      
      logMessage('Test message sent successfully', 'success');
    } catch (error) {
      logMessage(`Error sending message: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsRunningTest(false);
    }
  };

  // Close the socket
  const closeSocket = async () => {
    if (!socket) {
      logMessage('No socket available.', 'warning');
      return;
    }
    
    setIsRunningTest(true);
    
    try {
      logMessage('Closing socket...', 'info');
      
      await socket.close();
      setSocket(null);
      setListenPort(null);
      
      logMessage('Socket closed successfully', 'success');
    } catch (error) {
      logMessage(`Error closing socket: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsRunningTest(false);
    }
  };

  // Render log entries with appropriate styling
  const renderLogs = () => {
    if (logs.length === 0) {
      return (
        <Text style={styles.emptyLogsText}>
          No logs yet. Run a test to see results.
        </Text>
      );
    }
    
    return logs.map((log, index) => {
      let textStyle = styles.logText;
      let prefix = '•';
      
      switch (log.type) {
        case 'success':
          textStyle = styles.successLog;
          prefix = '✅';
          break;
        case 'error':
          textStyle = styles.errorLog;
          prefix = '❌';
          break;
        case 'warning':
          textStyle = styles.warningLog;
          prefix = '⚠️';
          break;
      }
      
      return (
        <Text key={index} style={[textStyle, styles.logEntry]}>
          {prefix} {log.message}
        </Text>
      );
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>QuicModel Test</Text>
      
      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={runInitTest}
          disabled={isRunningTest}
          style={styles.button}
        >
          Test QuicModel Init
        </Button>
        
        <Button
          mode="contained"
          onPress={testCreateSocket}
          disabled={isRunningTest || socket !== null}
          style={styles.button}
        >
          Create UDP Socket
        </Button>
        
        <Button
          mode="contained"
          onPress={bindSocket}
          disabled={isRunningTest || socket === null || listenPort !== null}
          style={styles.button}
        >
          Bind Socket
        </Button>
        
        <Button
          mode="contained"
          onPress={sendTestMessage}
          disabled={isRunningTest || socket === null}
          style={styles.button}
        >
          Send Test Message
        </Button>
        
        <Button
          mode="outlined"
          onPress={closeSocket}
          disabled={isRunningTest || socket === null}
          style={styles.button}
          buttonColor="transparent"
          textColor="#ff6b6b"
        >
          Close Socket
        </Button>
      </View>
      
      <Divider style={styles.divider} />
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Socket Status: {socket ? '🟢 Created' : '⚫ Not Created'}
        </Text>
        {listenPort && (
          <Text style={styles.statusText}>
            Listening on port: {listenPort}
          </Text>
        )}
      </View>
      
      <Text style={styles.logsTitle}>Test Logs</Text>
      
      {isRunningTest && (
        <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loader} />
      )}
      
      <ScrollView style={styles.logsContainer}>
        {renderLogs()}
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
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
  },
  button: {
    margin: 4,
    minWidth: 150,
  },
  divider: {
    marginVertical: 8,
  },
  statusContainer: {
    marginVertical: 8,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  logsContainer: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
    padding: 8,
  },
  logEntry: {
    paddingVertical: 4,
    fontSize: 14,
  },
  logText: {
    color: '#555',
  },
  successLog: {
    color: '#2ecc71',
  },
  errorLog: {
    color: '#e74c3c',
  },
  warningLog: {
    color: '#f39c12',
  },
  emptyLogsText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
  loader: {
    marginVertical: 8,
  },
});

export default QuicModelTest; 