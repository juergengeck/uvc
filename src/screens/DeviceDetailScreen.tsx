/**
 * Device Detail Screen
 * 
 * Shows detailed information about a specific device including:
 * - Basic device information (name, type, address)
 * - Connection status and history
 * - Device capabilities and configuration
 * - Connection actions (connect, disconnect, remove)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from 'react-native-paper';

interface DeviceInfo {
  id: string;
  deviceName: string;
  deviceType: string;
  address: string;
  port: string;
  isConnected: boolean;
  connectionType: string;
  lastSeen?: Date;
  capabilities?: string[];
  version?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  macAddress?: string;
  rssi?: number;
  batteryLevel?: number;
  uptime?: number;
  bytesReceived?: number;
  bytesSent?: number;
  packetsReceived?: number;
  packetsSent?: number;
  errors?: number;
  lastError?: string;
  remoteInstanceId?: string;
  remotePersonId?: string;
}

export const DeviceDetailScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Device data state
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get device ID from route params
  const deviceId = Array.isArray(params.id) ? params.id[0] : params.id;

  // Load device information
  const loadDeviceInfo = async () => {
    try {
      console.log(`[DeviceDetail] Loading device info for ID: "${deviceId}"`);
      
      if (!deviceId) {
        setError('No device ID provided');
        setLoading(false);
        return;
      }

      // Get device information from ModelService
      const { ModelService } = await import('../services/ModelService');
      const appModel = ModelService.getModel();
      
      if (!appModel) {
        setError('App model not available');
        setLoading(false);
        return;
      }

      let foundDevice: any = null;

      // First, try to find in discovered devices
      if (appModel.deviceDiscoveryModel) {
        const discoveredDevices = appModel.deviceDiscoveryModel.getDevices() || [];
        console.log(`[DeviceDetail] Searching ${discoveredDevices.length} discovered devices`);
        
        // Log all discovered device IDs for debugging
        if (discoveredDevices.length > 0) {
          console.log(`[DeviceDetail] Discovered device IDs:`, discoveredDevices.map((d: any) => d.id));
        }
        
        foundDevice = discoveredDevices.find((d: any) => d.id === deviceId);
        if (foundDevice) {
          console.log(`[DeviceDetail] Found device in discovered devices:`, foundDevice);
        }
      }

      // If not found in discovered devices, check live connections
      if (!foundDevice && appModel.connections) {
        try {
          const connections = appModel.connections.connectionsInfo() || [];
          console.log(`[DeviceDetail] Searching ${connections.length} live connections`);
          
          // Log all connection IDs for debugging
          if (connections.length > 0) {
            console.log(`[DeviceDetail] Connection IDs:`, connections.map((c: any) => c.id));
            console.log(`[DeviceDetail] Sample connection:`, connections[0]);
          }
          
          // Look for connection that matches the device ID exactly
          const connection = connections.find((conn: any) => {
            return conn.id === deviceId;
          });
          
          if (connection) {
            console.log(`[DeviceDetail] Found connection in live connections:`, connection);
            
            // Convert connection to device format with improved naming
            foundDevice = {
              id: connection.id,
              name: (() => {
                // For IoM devices, show instance information instead of Person ID
                if (connection.remoteInstanceId) {
                  // If we have instance name, use it
                  if ((connection as any).instanceName) {
                    return (connection as any).instanceName;
                  }
                  // Otherwise show the instance ID (more useful than Person ID for IoM)
                  return `Instance ${connection.remoteInstanceId.slice(0, 8)}...${connection.remoteInstanceId.slice(-8)}`;
                }
                // If this is a connection without instanceId, it might be a relay connection
                if (connection.remotePersonId) {
                  return `Remote Person ${connection.remotePersonId.slice(0, 8)}...`;
                }
                return (connection as any).deviceName || (connection as any).name || 'Unknown Connection';
              })(),
              type: connection.remoteInstanceId ? 'IoM Device' : 'Connection',
              address: (() => {
                // Try to extract address from serverUrl if available
                if ((connection as any).serverUrl || (connection as any).url) {
                  try {
                    const url = new URL((connection as any).serverUrl || (connection as any).url);
                    return url.hostname;
                  } catch {
                    return (connection as any).serverUrl || (connection as any).url || 'Unknown';
                  }
                }
                return (connection as any).address || 'Unknown';
              })(),
              port: (() => {
                // Try to extract port from serverUrl if available
                if ((connection as any).serverUrl || (connection as any).url) {
                  try {
                    const url = new URL((connection as any).serverUrl || (connection as any).url);
                    return url.port || (url.protocol === 'wss:' ? '443' : '80');
                  } catch {
                    return '0';
                  }
                }
                return (connection as any).port?.toString() || '0';
              })(),
              isConnected: connection.isConnected || false,
              connectionType: connection.remoteInstanceId ? 'iom' : 'relay',
              lastSeen: new Date(),
              bytesReceived: 0,
              bytesSent: 0,
              // Add additional fields for display
              remoteInstanceId: connection.remoteInstanceId,
              remotePersonId: connection.remotePersonId
            };
          }
        } catch (connError) {
          console.warn(`[DeviceDetail] Error accessing connections:`, connError);
        }
      }

      // If still not found, provide detailed debugging
      if (!foundDevice) {
        console.log(`[DeviceDetail] Device not found anywhere for ID: "${deviceId}"`);
        
        // Comprehensive debugging output
        if (appModel.deviceDiscoveryModel) {
          const discoveredDevices = appModel.deviceDiscoveryModel.getDevices() || [];
          console.log(`[DeviceDetail] Available discovered devices:`, discoveredDevices.map((d: any) => ({
            id: d.id,
            name: d.name || d.deviceName,
            type: d.type || d.deviceType
          })));
        }
        
        if (appModel.connections) {
          const connections = appModel.connections.connectionsInfo() || [];
          console.log(`[DeviceDetail] Available connections:`, connections.map((c: any) => ({
            id: c.id,
            remoteInstanceId: c.remoteInstanceId?.slice(0, 8) + '...',
            remotePersonId: c.remotePersonId?.slice(0, 8) + '...',
            isConnected: c.isConnected
          })));
        }
        
        setError(`Device not found with ID: "${deviceId}". The device may have been disconnected or removed.`);
        setLoading(false);
        return;
      }

      // Build comprehensive device info
      const deviceInfo: DeviceInfo = {
        id: foundDevice.id || deviceId,
        deviceName: (foundDevice as any).deviceName || foundDevice.name || 'Unknown Device',
        deviceType: (foundDevice as any).deviceType || foundDevice.type || 'Device',
        address: foundDevice.address || 'Unknown',
        port: foundDevice.port?.toString() || '0',
        isConnected: (foundDevice as any).isConnected || false,
        connectionType: (foundDevice as any).connectionType || 'unknown',
        lastSeen: foundDevice.lastSeen ? new Date(foundDevice.lastSeen) : undefined,
        capabilities: (foundDevice as any).capabilities || [],
        version: (foundDevice as any).version,
        manufacturer: (foundDevice as any).manufacturer,
        model: (foundDevice as any).model,
        serialNumber: (foundDevice as any).serialNumber,
        macAddress: (foundDevice as any).macAddress,
        rssi: (foundDevice as any).rssi,
        batteryLevel: (foundDevice as any).batteryLevel,
        uptime: (foundDevice as any).uptime,
        bytesReceived: (foundDevice as any).bytesReceived || 0,
        bytesSent: (foundDevice as any).bytesSent || 0,
        packetsReceived: (foundDevice as any).packetsReceived || 0,
        packetsSent: (foundDevice as any).packetsSent || 0,
        errors: (foundDevice as any).errors || 0,
        lastError: (foundDevice as any).lastError,
        remoteInstanceId: (foundDevice as any).remoteInstanceId,
        remotePersonId: (foundDevice as any).remotePersonId
      };

      setDevice(deviceInfo);
      setError(null);
      
    } catch (err) {
      console.error('[DeviceDetail] Failed to load device info:', err);
      setError(err instanceof Error ? err.message : 'Failed to load device info');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadDeviceInfo();
  }, [deviceId]);

  // Refresh handler
  const handleRefresh = () => {
    setRefreshing(true);
    loadDeviceInfo();
  };

  // Connect to device
  const handleConnect = async () => {
    if (!device) return;
    
    setConnecting(true);
    try {
      console.log(`[DeviceDetail] Connecting to device: ${device.deviceName}`);
      
      // TODO: Implement actual connection logic
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate connection
      
      Alert.alert('Success', `Connected to ${device.deviceName}`);
      
      // Refresh device info to show new connection status
      await loadDeviceInfo();
      
    } catch (error) {
      console.error('[DeviceDetail] Connection failed:', error);
      Alert.alert('Connection Failed', 'Could not connect to device. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect from device
  const handleDisconnect = async () => {
    if (!device) return;
    
    Alert.alert(
      'Disconnect Device',
      `Are you sure you want to disconnect from ${device.deviceName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`[DeviceDetail] Disconnecting from device: ${device.deviceName}`);
              
              // TODO: Implement actual disconnection logic
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              Alert.alert('Disconnected', `Disconnected from ${device.deviceName}`);
              await loadDeviceInfo();
              
            } catch (error) {
              console.error('[DeviceDetail] Disconnection failed:', error);
              Alert.alert('Error', 'Failed to disconnect from device.');
            }
          }
        }
      ]
    );
  };

  // Remove device
  const handleRemove = async () => {
    if (!device) return;
    
    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove ${device.deviceName} from your device list? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`[DeviceDetail] Removing device: ${device.deviceName}`);
              
              // TODO: Implement device removal logic
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              Alert.alert('Removed', `${device.deviceName} has been removed.`);
              router.back();
              
            } catch (error) {
              console.error('[DeviceDetail] Removal failed:', error);
              Alert.alert('Error', 'Failed to remove device.');
            }
          }
        }
      ]
    );
  };

  // Format data size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Render info row
  const renderInfoRow = (label: string, value: string | number | undefined, icon?: string) => {
    if (value === undefined || value === '' || value === 0) return null;
    
    return (
      <View style={styles.infoRow}>
        <View style={styles.infoLabel}>
          {icon && <Ionicons name={icon as any} size={16} color="#757575" style={styles.infoIcon} />}
          <Text style={styles.infoLabelText}>{label}</Text>
        </View>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    );
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#007aff" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading device information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#007aff" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
          <Text style={styles.errorText}>{error || 'Device not found'}</Text>
          <Button mode="contained" onPress={handleRefresh} style={styles.retryButton}>
            Try Again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#007aff" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Details</Text>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Device Header */}
        <View style={styles.deviceHeader}>
          <View style={styles.deviceIconContainer}>
            <Ionicons 
              name={device.connectionType === 'wifi' ? 'wifi' : 'hardware-chip'} 
              size={32} 
              color="#007aff" 
            />
          </View>
          <View style={styles.deviceHeaderInfo}>
            <Text style={styles.deviceName}>{device.deviceName}</Text>
            <Text style={styles.deviceType}>{device.deviceType}</Text>
            <View style={styles.connectionStatus}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: device.isConnected ? '#4CAF50' : '#F44336' }
              ]} />
              <Text style={[
                styles.statusText,
                { color: device.isConnected ? '#4CAF50' : '#F44336' }
              ]}>
                {device.isConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
          </View>
        </View>

        {/* Connection Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection Information</Text>
          <View style={styles.sectionContent}>
            {renderInfoRow('Address', device.address, 'location-outline')}
            {renderInfoRow('Port', device.port, 'radio-outline')}
            {renderInfoRow('Connection Type', device.connectionType, 'link-outline')}
            {device.lastSeen && renderInfoRow(
              'Last Seen', 
              device.lastSeen.toLocaleString(), 
              'time-outline'
            )}
            {device.rssi && renderInfoRow('Signal Strength', `${device.rssi} dBm`, 'cellular-outline')}
          </View>
        </View>

        {/* Device Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Information</Text>
          <View style={styles.sectionContent}>
            {renderInfoRow('Device ID', device.id.slice(0, 16) + '...', 'finger-print-outline')}
            {device.remoteInstanceId && renderInfoRow(
              'Instance ID', 
              `${device.remoteInstanceId.slice(0, 8)}...${device.remoteInstanceId.slice(-8)}`, 
              'cube-outline'
            )}
            {device.remotePersonId && renderInfoRow(
              'Person ID', 
              `${device.remotePersonId.slice(0, 8)}...${device.remotePersonId.slice(-8)}`, 
              'person-outline'
            )}
            {renderInfoRow('Manufacturer', device.manufacturer, 'business-outline')}
            {renderInfoRow('Model', device.model, 'cube-outline')}
            {renderInfoRow('Version', device.version, 'code-working-outline')}
            {renderInfoRow('Serial Number', device.serialNumber, 'barcode-outline')}
            {renderInfoRow('MAC Address', device.macAddress, 'wifi-outline')}
            {device.batteryLevel && renderInfoRow(
              'Battery Level', 
              `${device.batteryLevel}%`, 
              'battery-half-outline'
            )}
            {device.uptime && renderInfoRow(
              'Uptime', 
              formatUptime(device.uptime), 
              'timer-outline'
            )}
          </View>
        </View>

        {/* Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          <View style={styles.sectionContent}>
            {renderInfoRow('Bytes Received', formatBytes(device.bytesReceived || 0), 'arrow-down-outline')}
            {renderInfoRow('Bytes Sent', formatBytes(device.bytesSent || 0), 'arrow-up-outline')}
            {renderInfoRow('Packets Received', (device.packetsReceived || 0).toLocaleString(), 'download-outline')}
            {renderInfoRow('Packets Sent', (device.packetsSent || 0).toLocaleString(), 'upload-outline')}
            {device.errors && device.errors > 0 && renderInfoRow(
              'Errors', 
              device.errors.toString(), 
              'warning-outline'
            )}
            {device.lastError && renderInfoRow('Last Error', device.lastError, 'alert-circle-outline')}
          </View>
        </View>

        {/* Capabilities */}
        {device.capabilities && device.capabilities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Capabilities</Text>
            <View style={styles.sectionContent}>
              <View style={styles.capabilitiesContainer}>
                {device.capabilities.map((capability, index) => (
                  <View key={index} style={styles.capabilityChip}>
                    <Text style={styles.capabilityText}>{capability}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsContainer}>
            {device.isConnected ? (
              <Button
                mode="outlined"
                onPress={handleDisconnect}
                style={styles.actionButton}
                buttonColor="#FFF3E0"
                textColor="#FF9800"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                mode="contained"
                onPress={handleConnect}
                loading={connecting}
                disabled={connecting}
                style={styles.actionButton}
                buttonColor="#007aff"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </Button>
            )}
            
            <Button
              mode="outlined"
              onPress={handleRemove}
              style={styles.actionButton}
              buttonColor="#FFEBEE"
              textColor="#F44336"
            >
              Remove Device
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  backButtonText: {
    fontSize: 17,
    color: '#007aff',
    fontWeight: '400',
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginLeft: 16,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 16,
    color: '#757575',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#007aff',
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  deviceIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  deviceHeaderInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  deviceType: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 8,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoIcon: {
    marginRight: 8,
  },
  infoLabelText: {
    fontSize: 15,
    color: '#424242',
  },
  infoValue: {
    fontSize: 15,
    color: '#757575',
    textAlign: 'right',
    flex: 1,
    fontFamily: 'monospace',
  },
  capabilitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
  },
  capabilityChip: {
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  capabilityText: {
    fontSize: 13,
    color: '#1976d2',
    fontWeight: '500',
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 8,
  },
});

export default DeviceDetailScreen; 