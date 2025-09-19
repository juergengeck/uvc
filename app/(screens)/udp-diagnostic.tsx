/**
 * UDP Diagnostic Screen
 * 
 * Shows diagnostic information for UDP/ESP32 discovery functionality
 */
import React, { useState } from 'react';
import { UDPSniffer } from '@src/components/UDPSniffer';
import { Stack } from 'expo-router';
import { View, ScrollView, StyleSheet, Text } from 'react-native';
import UDPDiagnosticButton from '@src/components/UDPDiagnosticButton';
import UDPModuleTestButton from '@src/components/UDPModuleTestButton';

/**
 * UDP Diagnostic Page
 * 
 * Displays diagnostic tools for ESP32 UDP communication:
 * 1. ESP32 Communication Test - for testing basic connectivity
 * 2. UDP Packet Sniffer - for detailed packet inspection
 * 3. UDP Module Test - for comprehensive UDP module testing
 */
export default function UDPDiagnosticPage() {
  const [activeTab, setActiveTab] = useState<'test' | 'sniffer' | 'module'>('test');

  return (
    <>
      <Stack.Screen
        options={{
          title: 'ESP32 UDP Diagnostics',
          headerLargeTitle: false,
        }}
      />
      
      <ScrollView style={styles.container}>
        <View style={styles.tabContainer}>
          <Text style={styles.heading}>ESP32 UDP Diagnostics</Text>
          <Text style={styles.description}>
            Use these tools to troubleshoot ESP32 UDP communication issues:
          </Text>
          
          <View style={styles.tabs}>
            <Text 
              style={[
                styles.tabItem, 
                activeTab === 'test' && styles.activeTab
              ]}
              onPress={() => setActiveTab('test')}
            >
              UDP Diagnostic Test
            </Text>
            <Text 
              style={[
                styles.tabItem, 
                activeTab === 'sniffer' && styles.activeTab
              ]}
              onPress={() => setActiveTab('sniffer')}
            >
              UDP Sniffer
            </Text>
            <Text 
              style={[
                styles.tabItem, 
                activeTab === 'module' && styles.activeTab
              ]}
              onPress={() => setActiveTab('module')}
            >
              UDP Module
            </Text>
          </View>
        </View>
        
        {activeTab === 'test' ? (
          <View style={styles.contentContainer}>
            <UDPDiagnosticButton />
            
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>About ESP32 UDP Test</Text>
              <Text style={styles.infoText}>
                This test helps diagnose ESP32 UDP communication issues by:
              </Text>
              <Text style={styles.infoBullet}>• Creating a UDP socket and binding to port 49497</Text>
              <Text style={styles.infoBullet}>• Enabling broadcast reception</Text>
              <Text style={styles.infoBullet}>• Listening for incoming ESP32 discovery packets</Text>
              <Text style={styles.infoBullet}>• Optionally sending test packets to a specific IP</Text>
              <Text style={styles.infoText}>
                If your ESP32 device is properly configured, you should see packets
                being received during the test.
              </Text>
            </View>
          </View>
        ) : activeTab === 'sniffer' ? (
          <View style={styles.contentContainer}>
            <UDPSniffer />
            
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>About UDP Sniffer</Text>
              <Text style={styles.infoText}>
                The UDP Sniffer captures all packets on port 49497 and displays them
                in detail, showing both ASCII and hexadecimal representations.
                Use this for in-depth analysis of UDP communication.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.contentContainer}>
            <UDPModuleTestButton />
            
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>About UDP Module Test</Text>
              <Text style={styles.infoText}>
                The UDP Module Test performs comprehensive diagnostics on the UDP implementation:
              </Text>
              <Text style={styles.infoBullet}>• Socket creation and binding</Text>
              <Text style={styles.infoBullet}>• Broadcast capability</Text>
              <Text style={styles.infoBullet}>• Data sending and receiving</Text>
              <Text style={styles.infoBullet}>• Event handling</Text>
              <Text style={styles.infoText}>
                This test helps identify issues with the underlying UDP implementation,
                checking if the basic UDP functionality works correctly.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#555',
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeTab: {
    color: '#007bff',
    borderBottomWidth: 2,
    borderBottomColor: '#007bff',
  },
  contentContainer: {
    padding: 16,
  },
  infoBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  infoBullet: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    marginBottom: 4,
  }
}); 