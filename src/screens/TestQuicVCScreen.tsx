import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { Text, Button, Card, List, Divider, Surface, Chip } from 'react-native-paper';
import { QuicVCConnectionManager } from '@src/models/network/QuicVCConnectionManager';
import { VCManager } from '@src/models/network/vc/VCManager';
import { useAppModel } from '@src/hooks/useAppModel';
import { requireStringId } from '@src/utils/ids';
import type { VerifiedVCInfo } from '@src/models/network/vc/VCManager';

export function TestQuicVCScreen() {
    const { appModel } = useAppModel();
    const [quicVC, setQuicVC] = useState<QuicVCConnectionManager | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [connections, setConnections] = useState<Array<{deviceId: string, status: string}>>([]);
    const [logs, setLogs] = useState<string[]>([]);
    
    // Test device info
    const testDevice = {
        id: 'esp32-a846744176c8',
        address: '192.168.178.83',
        port: 49498 // Using different port for QUICVC
    };
    
    useEffect(() => {
        initializeQuicVC();
    }, []);
    
    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
    };
    
    const initializeQuicVC = async () => {
        try {
            if (!appModel) {
                addLog('ERROR: AppModel not available');
                return;
            }
            
            const personId = appModel.getSelfId();
            if (!personId) {
                addLog('ERROR: No person ID available');
                return;
            }
            
            addLog(`Initializing QUICVC with Person ID: ${personId}`);
            
            // Get VCManager from DeviceDiscoveryModel
            const deviceDiscoveryModel = (await import('@src/models/network/DeviceDiscoveryModel')).DeviceDiscoveryModel.getInstance();
            const vcManager = (deviceDiscoveryModel as any)._vcManager;
            
            if (!vcManager) {
                addLog('ERROR: VCManager not available in DeviceDiscoveryModel');
                return;
            }
            
            // Create QUICVC manager
            const manager = QuicVCConnectionManager.getInstance(requireStringId(personId));
            
            // Initialize with VCManager
            await manager.initialize(vcManager);
            
            // Setup event listeners
            manager.onConnectionEstablished.listen((deviceId, vcInfo) => {
                addLog(`✅ Connection established: ${deviceId}`);
                addLog(`   Owner: ${vcInfo.issuerPersonId}`);
                updateConnectionStatus(deviceId, 'connected');
            });
            
            manager.onHandshakeComplete.listen((deviceId) => {
                addLog(`🤝 Handshake complete: ${deviceId}`);
            });
            
            manager.onConnectionClosed.listen((deviceId, reason) => {
                addLog(`❌ Connection closed: ${deviceId} - ${reason}`);
                updateConnectionStatus(deviceId, 'closed');
            });
            
            manager.onPacketReceived.listen((deviceId, data) => {
                const message = new TextDecoder().decode(data);
                addLog(`📨 Received from ${deviceId}: ${message}`);
            });
            
            manager.onError.listen((deviceId, error) => {
                addLog(`⚠️ Error for ${deviceId}: ${error.message}`);
            });
            
            setQuicVC(manager);
            setIsInitialized(true);
            addLog('✅ QUICVC initialized successfully');
            
        } catch (error) {
            addLog(`ERROR: Failed to initialize - ${error}`);
        }
    };
    
    const updateConnectionStatus = (deviceId: string, status: string) => {
        setConnections(prev => {
            const existing = prev.find(c => c.deviceId === deviceId);
            if (existing) {
                return prev.map(c => c.deviceId === deviceId ? {...c, status} : c);
            }
            return [...prev, {deviceId, status}];
        });
    };
    
    const connectToDevice = async () => {
        if (!quicVC) {
            Alert.alert('Error', 'QUICVC not initialized');
            return;
        }
        
        try {
            addLog(`Connecting to ${testDevice.id}...`);
            updateConnectionStatus(testDevice.id, 'connecting');
            
            await quicVC.connect(
                testDevice.id,
                testDevice.address,
                testDevice.port
            );
            
        } catch (error) {
            addLog(`Connection failed: ${error}`);
            updateConnectionStatus(testDevice.id, 'failed');
        }
    };
    
    const sendTestMessage = async () => {
        if (!quicVC || !quicVC.isConnected(testDevice.id)) {
            Alert.alert('Error', 'Not connected to device');
            return;
        }
        
        try {
            const message = { 
                type: 'test',
                timestamp: Date.now(),
                data: 'Hello from QUICVC!'
            };
            
            const data = new TextEncoder().encode(JSON.stringify(message));
            await quicVC.sendData(testDevice.id, data);
            
            addLog(`📤 Sent test message to ${testDevice.id}`);
        } catch (error) {
            addLog(`Send failed: ${error}`);
        }
    };
    
    const disconnectDevice = () => {
        if (!quicVC) return;
        
        quicVC.disconnect(testDevice.id);
        addLog(`Disconnecting ${testDevice.id}`);
    };
    
    const getConnectionStatus = () => {
        const conn = connections.find(c => c.deviceId === testDevice.id);
        return conn?.status || 'disconnected';
    };
    
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'connected': return '#4CAF50';
            case 'connecting': return '#FF9800';
            case 'failed': return '#F44336';
            default: return '#9E9E9E';
        }
    };
    
    return (
        <ScrollView style={styles.container}>
            <Card style={styles.card}>
                <Card.Title title="QUICVC Test Interface" />
                <Card.Content>
                    <View style={styles.statusRow}>
                        <Text>Initialization Status:</Text>
                        <Chip 
                            icon={isInitialized ? 'check' : 'close'}
                            style={{backgroundColor: isInitialized ? '#4CAF50' : '#F44336'}}
                            textStyle={{color: 'white'}}
                        >
                            {isInitialized ? 'Ready' : 'Not Ready'}
                        </Chip>
                    </View>
                </Card.Content>
            </Card>
            
            <Card style={styles.card}>
                <Card.Title title="Test Device" />
                <Card.Content>
                    <List.Item
                        title={testDevice.id}
                        description={`${testDevice.address}:${testDevice.port}`}
                        left={() => <List.Icon icon="devices" />}
                        right={() => (
                            <Chip 
                                style={{
                                    backgroundColor: getStatusColor(getConnectionStatus())
                                }}
                                textStyle={{color: 'white'}}
                            >
                                {getConnectionStatus()}
                            </Chip>
                        )}
                    />
                </Card.Content>
                <Card.Actions>
                    <Button 
                        mode="contained" 
                        onPress={connectToDevice}
                        disabled={!isInitialized || getConnectionStatus() === 'connected'}
                    >
                        Connect
                    </Button>
                    <Button 
                        mode="outlined" 
                        onPress={sendTestMessage}
                        disabled={getConnectionStatus() !== 'connected'}
                    >
                        Send Test
                    </Button>
                    <Button 
                        mode="text" 
                        onPress={disconnectDevice}
                        disabled={getConnectionStatus() !== 'connected'}
                    >
                        Disconnect
                    </Button>
                </Card.Actions>
            </Card>
            
            <Card style={styles.card}>
                <Card.Title title="Event Log" />
                <Card.Content>
                    <Surface style={styles.logContainer}>
                        {logs.map((log, index) => (
                            <Text key={index} style={styles.logEntry}>
                                {log}
                            </Text>
                        ))}
                        {logs.length === 0 && (
                            <Text style={styles.emptyLog}>No events yet...</Text>
                        )}
                    </Surface>
                </Card.Content>
            </Card>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    card: {
        margin: 8,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 8,
    },
    logContainer: {
        maxHeight: 300,
        padding: 8,
        backgroundColor: '#f0f0f0',
        borderRadius: 4,
    },
    logEntry: {
        fontSize: 12,
        fontFamily: 'monospace',
        marginVertical: 2,
    },
    emptyLog: {
        fontSize: 12,
        fontStyle: 'italic',
        color: '#666',
        textAlign: 'center',
    },
});