import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Text as RNText, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { Button, Text, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import CommServerProtocolTestComponent from '@src/components/diagnostics/CommServerProtocolTestComponent';
import { runUDPDiagnostic } from '@src/tools/UDPDiagnostic';
import { runInvitationCompatibilityTest } from '@src/utils/invitationTesting';
import ESP32PracticalTests from '@src/components/diagnostics/ESP32PracticalTests';

/**
 * Simple UDP diagnostics component
 */
const UDPDiagnosticsComponent = ({ maxPackets = 100 }: { maxPackets?: number }) => {
  const { theme, styles: themedStyles } = useTheme();
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  
  const startDiagnostics = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setLogs((prev) => [...prev, "Starting UDP diagnostics..."]);
    
    try {
      const result = await runUDPDiagnostic({ timeout: 30000 });
      
      setLogs((prev) => [
        ...prev,
        `Diagnostics complete:`,
        `Success: ${result.success ? 'YES' : 'NO'}`,
        `Packets received: ${result.messagesReceived}`,
        `Errors: ${result.errors.length ? result.errors.join(', ') : 'None'}`,
        ...result.receivedPackets.map((p, i) => 
          `[${i+1}] From ${p.address}:${p.port} (${p.size} bytes)`
        ).slice(0, maxPackets)
      ].slice(-maxPackets));
    } catch (error) {
      setLogs((prev) => [...prev, `Error: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setIsRunning(false);
    }
  };
  
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
        <Button
          mode="contained"
          onPress={startDiagnostics}
          disabled={isRunning}
          style={[themedStyles.buttonPrimary, { flex: 1, marginRight: 8 }]}
          labelStyle={themedStyles.buttonPrimaryText}
        >
          {isRunning ? t('common.running', { defaultValue: 'Running...' }) : t('settings.network.diagnostics.startDiagnostics', { defaultValue: 'Start Diagnostics' })}
        </Button>
        <Button
          mode="outlined"
          onPress={() => setLogs([])}
          disabled={isRunning || logs.length === 0}
          style={{ flex: 1, marginLeft: 8 }}
        >
          {t('common.clear', { defaultValue: 'Clear' })}
        </Button>
      </View>
      <ScrollView style={{ flex: 1, padding: 16, backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        default: theme.colors.surfaceVariant,
      }), borderRadius: 8, margin: 16 }}>
        {logs.length === 0 ? (
          <RNText style={{ color: theme.colors.onSurfaceVariant, ...themedStyles.itemDescription }}>
            {t('settings.network.diagnostics.udpInstructions', { defaultValue: 'Press "Start Diagnostics" to monitor UDP packets' })}
          </RNText>
        ) : (
          logs.map((log, index) => (
            <RNText key={index} style={{ color: theme.colors.onSurface, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 4 }}>
              {log}
            </RNText>
          ))
        )}
      </ScrollView>
    </View>
  );
};

/**
 * Network Diagnostics Screen
 * 
 * Dedicated view for network diagnostics and testing
 */
export default function NetworkDiagnosticsScreen() {
  const { t } = useTranslation();
  const { theme, styles: themedStyles } = useTheme();
  
  const styles = StyleSheet.create({
    sectionContent: {
      padding: 16,
    },
    sectionSubtitle: {
      ...themedStyles.itemDescription,
      marginBottom: 16,
    },
    diagnosticsWrapper: {
      height: 300,
      backgroundColor: Platform.select({
        ios: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        default: theme.colors.surfaceVariant,
      }),
      borderRadius: 8,
      overflow: 'hidden',
    },
  });
  
  // Run invitation compatibility test
  const handleInvitationTest = async () => {
    console.log('[NetworkDiagnostics] Running invitation compatibility test...');
    try {
      await runInvitationCompatibilityTest();
    } catch (error) {
      console.error('[NetworkDiagnostics] Invitation test failed:', error);
    }
  };
  
  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* CommServer Protocol Test */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.diagnostics.commServerTest', { defaultValue: 'COMMSERVER PROTOCOL TEST' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionSubtitle}>
              {t('settings.network.diagnostics.commServerDescription', { defaultValue: 'Validate CommServer protocol implementation and identity consistency' })}
            </Text>
            <View style={styles.diagnosticsWrapper}>
              <CommServerProtocolTestComponent />
            </View>
          </View>
        </View>
        
        {/* Invitation Compatibility Test */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.diagnostics.invitationTest', { defaultValue: 'INVITATION COMPATIBILITY TEST' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <Button
              mode="contained"
              onPress={handleInvitationTest}
              style={themedStyles.buttonPrimary}
              labelStyle={themedStyles.buttonPrimaryText}
            >
              {t('settings.network.diagnostics.runInvitationTest', { defaultValue: 'Run Invitation Test' })}
            </Button>
          </View>
        </View>
        
        {/* UDP Packet Monitor */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.diagnostics.udpMonitor', { defaultValue: 'UDP PACKET MONITOR' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionSubtitle}>
              {t('settings.network.diagnostics.udpDescription', { defaultValue: 'Monitor raw UDP packets to diagnose network discovery issues' })}
            </Text>
            <View style={styles.diagnosticsWrapper}>
              <UDPDiagnosticsComponent maxPackets={100} />
            </View>
          </View>
        </View>
        
        {/* ESP32 Performance Tests */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          ESP32 PERFORMANCE TESTS
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionSubtitle}>
              Measure real-world ESP32 device performance with practical timing tests
            </Text>
            <View style={[styles.diagnosticsWrapper, { height: 500 }]}>
              <ESP32PracticalTests />
            </View>
          </View>
        </View>
        
      </ScrollView>
    </SafeAreaView>
  );
}