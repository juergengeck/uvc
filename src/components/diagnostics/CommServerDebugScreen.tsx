/**
 * CommServerDebugScreen - Comprehensive debugging and monitoring for CommServer
 * 
 * This component provides real-time visibility into:
 * - Connection status and health
 * - Active invitations and validation
 * - Message flow statistics
 * - Interactive debugging tools
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { StyleSheet } from 'react-native';
import { ModelService } from '../../services/ModelService';
import type { AppModel } from '../../models/AppModel';

interface ConnectionStats {
  status: string;
  connectionId?: string;
  lastConnected?: Date;
  reconnectAttempts: number;
  hasPublicKey: boolean;
  commServerUrl: string;
  connectionState: any;
}

interface CommServerStats {
  commServerConnections: number;
  authenticatedConnections: number;
  totalConnections: number;
  pairingConnections: number;
  establishedConnections: number;
  activeInvitations: number;
}

interface LogEntry {
  timestamp: Date;
  level: 'info' | 'debug' | 'error' | 'warning';
  message: string;
  data?: any;
}

export const CommServerDebugScreen: React.FC = () => {
  const [appModel, setAppModel] = useState<AppModel | null>(null);
  const [connectionStats, setConnectionStats] = useState<ConnectionStats | null>(null);
  const [commServerStats, setCommServerStats] = useState<CommServerStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [logLevel, setLogLevel] = useState<'all' | 'info' | 'debug' | 'error'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Initialize app model
  useEffect(() => {
    const model = ModelService.getModel();
    setAppModel(model || null);
  }, []);

  // Auto-refresh data
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshData();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, appModel]);

  // Initial data load
  useEffect(() => {
    if (appModel) {
      refreshData();
    }
  }, [appModel]);

  const refreshData = useCallback(async () => {
    if (!appModel) return;

    try {
      // Get network status
      const networkStatus = appModel.getNetworkStatus();
      setConnectionStats(networkStatus);

      // Get CommServer stats
      const stats = appModel.getCommServerStats();
      setCommServerStats(stats);

      // Add log entry for successful refresh
      addLogEntry('debug', 'Data refreshed successfully');

    } catch (error) {
      console.error('[CommServerDebugScreen] Error refreshing data:', error);
      addLogEntry('error', 'Failed to refresh data', error);
    }
  }, [appModel]);

  const addLogEntry = useCallback((level: LogEntry['level'], message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data
    };

    setLogs(prev => [entry, ...prev.slice(0, 99)]); // Keep last 100 entries
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const handleForceReconnect = useCallback(async () => {
    if (!appModel?.networkPlugin) {
      Alert.alert('Error', 'NetworkPlugin not available');
      return;
    }

    try {
      addLogEntry('info', 'Forcing reconnection...');
      await appModel.networkPlugin.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      await appModel.networkPlugin.connect();
      addLogEntry('info', 'Reconnection completed');
      Alert.alert('Success', 'Reconnection initiated');
    } catch (error) {
      addLogEntry('error', 'Reconnection failed', error);
      Alert.alert('Error', `Reconnection failed: ${error}`);
    }
  }, [appModel, addLogEntry]);

  const handleClearInvitations = useCallback(() => {
    if (!appModel?.commServerManager) {
      Alert.alert('Error', 'CommServerManager not available');
      return;
    }

    try {
      // Clear active invitations (if method exists)
      if (typeof appModel.commServerManager.clearActiveInvitations === 'function') {
        appModel.commServerManager.clearActiveInvitations();
        addLogEntry('info', 'Active invitations cleared');
        Alert.alert('Success', 'Active invitations cleared');
      } else {
        Alert.alert('Info', 'Clear invitations method not available');
      }
    } catch (error) {
      addLogEntry('error', 'Failed to clear invitations', error);
      Alert.alert('Error', `Failed to clear invitations: ${error}`);
    }
  }, [appModel, addLogEntry]);

  const handleTestAuthentication = useCallback(async () => {
    if (!appModel?.networkPlugin) {
      Alert.alert('Error', 'NetworkPlugin not available');
      return;
    }

    try {
      addLogEntry('info', 'Testing authentication flow...');
      
      // Send a test message to trigger authentication
      await appModel.networkPlugin.sendMessage({
        command: 'test_auth',
        timestamp: Date.now()
      });
      
      addLogEntry('info', 'Test authentication message sent');
      Alert.alert('Success', 'Test authentication message sent');
    } catch (error) {
      addLogEntry('error', 'Authentication test failed', error);
      Alert.alert('Error', `Authentication test failed: ${error}`);
    }
  }, [appModel, addLogEntry]);

  const handleSendTestMessage = useCallback(async () => {
    if (!appModel?.networkPlugin) {
      Alert.alert('Error', 'NetworkPlugin not available');
      return;
    }

    try {
      const testMessage = {
        command: 'test_message',
        timestamp: Date.now(),
        data: 'Hello from debug screen'
      };

      addLogEntry('info', 'Sending test message...', testMessage);
      await appModel.networkPlugin.sendMessage(testMessage);
      addLogEntry('info', 'Test message sent successfully');
      Alert.alert('Success', 'Test message sent');
    } catch (error) {
      addLogEntry('error', 'Failed to send test message', error);
      Alert.alert('Error', `Failed to send test message: ${error}`);
    }
  }, [appModel, addLogEntry]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'connected':
      case 'authenticated':
        return '#4CAF50'; // Green
      case 'connecting':
      case 'authenticating':
        return '#FF9800'; // Orange
      case 'disconnected':
      case 'error':
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Gray
    }
  };

  const getLogLevelColor = (level: LogEntry['level']): string => {
    switch (level) {
      case 'error':
        return '#F44336';
      case 'warning':
        return '#FF9800';
      case 'info':
        return '#2196F3';
      case 'debug':
        return '#9E9E9E';
      default:
        return '#000000';
    }
  };

  const filteredLogs = logs.filter(log => 
    logLevel === 'all' || log.level === logLevel
  );

  if (!appModel) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>CommServer Debug</Text>
        <Text style={styles.error}>AppModel not available</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <Text style={styles.title}>CommServer Debug & Monitoring</Text>

      {/* Connection Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection Status</Text>
        {connectionStats ? (
          <View style={styles.statusContainer}>
            <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(connectionStats.status) }]} />
            <View style={styles.statusDetails}>
              <Text style={styles.statusText}>Status: {connectionStats.status}</Text>
              <Text style={styles.statusText}>URL: {connectionStats.commServerUrl}</Text>
              {connectionStats.connectionId && (
                <Text style={styles.statusText}>ID: {connectionStats.connectionId}</Text>
              )}
              <Text style={styles.statusText}>
                Reconnect Attempts: {connectionStats.reconnectAttempts}
              </Text>
              <Text style={styles.statusText}>
                Has Public Key: {connectionStats.hasPublicKey ? 'Yes' : 'No'}
              </Text>
              {connectionStats.lastConnected && (
                <Text style={styles.statusText}>
                  Last Connected: {connectionStats.lastConnected.toLocaleTimeString()}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={styles.error}>Connection stats not available</Text>
        )}
      </View>

      {/* CommServer Statistics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CommServer Statistics</Text>
        {commServerStats ? (
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>CommServer Connections</Text>
              <Text style={styles.statValue}>{commServerStats.commServerConnections}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Authenticated</Text>
              <Text style={styles.statValue}>{commServerStats.authenticatedConnections}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Connections</Text>
              <Text style={styles.statValue}>{commServerStats.totalConnections}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Pairing Connections</Text>
              <Text style={styles.statValue}>{commServerStats.pairingConnections}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Established Connections</Text>
              <Text style={styles.statValue}>{commServerStats.establishedConnections}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Active Invitations</Text>
              <Text style={styles.statValue}>{commServerStats.activeInvitations}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.error}>CommServer stats not available</Text>
        )}
      </View>

      {/* Debug Commands */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Debug Commands</Text>
        <View style={styles.buttonGrid}>
          <TouchableOpacity style={styles.debugButton} onPress={handleForceReconnect}>
            <Text style={styles.debugButtonText}>Force Reconnect</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.debugButton} onPress={handleClearInvitations}>
            <Text style={styles.debugButtonText}>Clear Invitations</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.debugButton} onPress={handleTestAuthentication}>
            <Text style={styles.debugButtonText}>Test Auth</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.debugButton} onPress={handleSendTestMessage}>
            <Text style={styles.debugButtonText}>Send Test Message</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Auto Refresh Toggle */}
      <View style={styles.section}>
        <TouchableOpacity 
          style={[styles.toggleButton, autoRefresh && styles.toggleButtonActive]} 
          onPress={() => setAutoRefresh(!autoRefresh)}
        >
          <Text style={[styles.toggleButtonText, autoRefresh && styles.toggleButtonTextActive]}>
            Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Log Level Filter */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Message Logs</Text>
        <View style={styles.logLevelFilter}>
          {(['all', 'info', 'debug', 'error'] as const).map(level => (
            <TouchableOpacity
              key={level}
              style={[styles.logLevelButton, logLevel === level && styles.logLevelButtonActive]}
              onPress={() => setLogLevel(level)}
            >
              <Text style={[styles.logLevelButtonText, logLevel === level && styles.logLevelButtonTextActive]}>
                {level.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Logs */}
      <View style={styles.section}>
        <View style={styles.logsContainer}>
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log, index) => (
              <View key={index} style={styles.logEntry}>
                <Text style={styles.logTimestamp}>
                  {log.timestamp.toLocaleTimeString()}
                </Text>
                <Text style={[styles.logLevel, { color: getLogLevelColor(log.level) }]}>
                  [{log.level.toUpperCase()}]
                </Text>
                <Text style={styles.logMessage}>{log.message}</Text>
                {log.data && (
                  <Text style={styles.logData}>
                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                  </Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.noLogs}>No logs available</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    marginTop: 4,
  },
  statusDetails: {
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#666',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  debugButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    marginBottom: 8,
    width: '48%',
  },
  debugButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },
  toggleButton: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    alignSelf: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#4CAF50',
  },
  toggleButtonText: {
    color: '#666',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  toggleButtonTextActive: {
    color: 'white',
  },
  logLevelFilter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  logLevelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  logLevelButtonActive: {
    backgroundColor: '#2196F3',
  },
  logLevelButtonText: {
    fontSize: 12,
    color: '#666',
  },
  logLevelButtonTextActive: {
    color: 'white',
  },
  logsContainer: {
    maxHeight: 300,
  },
  logEntry: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  logTimestamp: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  logLevel: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  logMessage: {
    fontSize: 12,
    color: '#333',
    marginBottom: 2,
  },
  logData: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
    backgroundColor: '#f8f8f8',
    padding: 4,
    borderRadius: 2,
  },
  noLogs: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    padding: 20,
  },
  error: {
    color: '#F44336',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default CommServerDebugScreen; 