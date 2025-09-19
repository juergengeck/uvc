/**
 * Device Health Data Screen
 * Displays real-time health data from connected devices
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  ScrollView, 
  RefreshControl,
  Alert
} from 'react-native';
import { 
  Text, 
  Card,
  Button,
  ActivityIndicator,
  useTheme,
  IconButton,
  Chip,
  ProgressBar,
  List,
  Divider
} from 'react-native-paper';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { r02RingService, HealthData, SleepData } from '@src/services/health/R02RingService';

export default function DeviceDataScreen() {
  const { t } = useTranslation('health');
  const router = useRouter();
  const { theme, styles: themedStyles } = useAppTheme();
  const paperTheme = useTheme();
  const params = useLocalSearchParams();
  
  const deviceId = params.deviceId as string;
  const deviceName = params.deviceName as string || 'Health Device';
  
  // State
  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [sleepData, setSleepData] = useState<SleepData[]>([]);
  const [dataHistory, setDataHistory] = useState<HealthData[]>([]);

  // Connect to device on mount
  useEffect(() => {
    connectToDevice();
    
    // Set up event listeners
    r02RingService.on('connected', handleConnected);
    r02RingService.on('disconnected', handleDisconnected);
    r02RingService.on('healthData', handleHealthData);
    r02RingService.on('sleepData', handleSleepData);
    r02RingService.on('error', handleError);
    
    return () => {
      // Clean up
      r02RingService.removeAllListeners();
      r02RingService.disconnect();
    };
  }, [deviceId]);

  const connectToDevice = async () => {
    setConnecting(true);
    try {
      const success = await r02RingService.connect(deviceId);
      if (!success) {
        throw new Error('Connection failed');
      }
    } catch (error) {
      console.error('[DeviceData] Connection error:', error);
      Alert.alert(
        t('common:error', { defaultValue: 'Error' }),
        t('health.connectionFailed', { defaultValue: 'Failed to connect to device' }),
        [
          { text: t('common:retry', { defaultValue: 'Retry' }), onPress: connectToDevice },
          { text: t('common:cancel', { defaultValue: 'Cancel' }), onPress: () => router.back() }
        ]
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleConnected = () => {
    console.log('[DeviceData] Device connected');
    setConnected(true);
    setConnecting(false);
  };

  const handleDisconnected = () => {
    console.log('[DeviceData] Device disconnected');
    setConnected(false);
    Alert.alert(
      t('health.disconnected', { defaultValue: 'Device Disconnected' }),
      t('health.deviceDisconnectedMessage', { defaultValue: 'The device has been disconnected' }),
      [
        { text: t('common:ok', { defaultValue: 'OK' }), onPress: () => router.back() }
      ]
    );
  };

  const handleHealthData = (data: HealthData) => {
    console.log('[DeviceData] Received health data:', data);
    setHealthData(data);
    
    // Add to history (keep last 50 readings)
    setDataHistory(prev => {
      const newHistory = [data, ...prev].slice(0, 50);
      return newHistory;
    });
  };

  const handleSleepData = (data: SleepData) => {
    console.log('[DeviceData] Received sleep data:', data);
    setSleepData(prev => [data, ...prev].slice(0, 7)); // Keep last 7 days
  };

  const handleError = (error: any) => {
    console.error('[DeviceData] Service error:', error);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Request fresh data
      await r02RingService.requestData('heartRate');
      await r02RingService.requestData('spo2');
      await r02RingService.requestData('steps');
      await r02RingService.requestData('battery');
      await r02RingService.requestData('temperature');
    } catch (error) {
      console.error('[DeviceData] Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getHeartRateColor = (hr: number) => {
    if (hr < 50) return paperTheme.colors.error;
    if (hr < 60) return paperTheme.colors.tertiary;
    if (hr <= 100) return paperTheme.colors.primary;
    return paperTheme.colors.error;
  };

  const getSpo2Color = (spo2: number) => {
    if (spo2 >= 95) return paperTheme.colors.primary;
    if (spo2 >= 90) return paperTheme.colors.tertiary;
    return paperTheme.colors.error;
  };

  if (connecting) {
    return (
      <SafeAreaView style={[themedStyles.screenContainer, { justifyContent: 'center', alignItems: 'center' }]}>
        <Stack.Screen
          options={{
            title: deviceName,
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.onSurface,
          }}
        />
        <ActivityIndicator size="large" color={paperTheme.colors.primary} />
        <Text style={{ marginTop: 16 }}>
          {t('health.connecting', { defaultValue: 'Connecting to device...' })}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: deviceName,
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerRight: () => (
            <Chip 
              mode="flat" 
              selected={connected}
              style={{ marginRight: 16 }}
            >
              {connected ? 'Connected' : 'Disconnected'}
            </Chip>
          )
        }}
      />
      
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Connection Status */}
        {!connected && (
          <Card mode="outlined" style={{ marginBottom: 16, borderColor: paperTheme.colors.error }}>
            <Card.Content>
              <Text variant="bodyMedium">Device is disconnected</Text>
            </Card.Content>
            <Card.Actions>
              <Button onPress={connectToDevice}>Reconnect</Button>
            </Card.Actions>
          </Card>
        )}

        {/* Primary Metrics */}
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          {/* Heart Rate Card */}
          <Card mode="elevated" style={{ flex: 1, marginRight: 8 }}>
            <Card.Content style={{ alignItems: 'center' }}>
              <IconButton 
                icon="heart-pulse" 
                size={32}
                iconColor={healthData?.heartRate ? getHeartRateColor(healthData.heartRate) : paperTheme.colors.onSurfaceDisabled}
              />
              <Text variant="displaySmall" style={{ color: healthData?.heartRate ? getHeartRateColor(healthData.heartRate) : undefined }}>
                {healthData?.heartRate || '--'}
              </Text>
              <Text variant="bodySmall">BPM</Text>
              <Text variant="bodySmall" style={{ opacity: 0.6 }}>Heart Rate</Text>
            </Card.Content>
          </Card>

          {/* SpO2 Card */}
          <Card mode="elevated" style={{ flex: 1, marginLeft: 8 }}>
            <Card.Content style={{ alignItems: 'center' }}>
              <IconButton 
                icon="water-percent" 
                size={32}
                iconColor={healthData?.spo2 ? getSpo2Color(healthData.spo2) : paperTheme.colors.onSurfaceDisabled}
              />
              <Text variant="displaySmall" style={{ color: healthData?.spo2 ? getSpo2Color(healthData.spo2) : undefined }}>
                {healthData?.spo2 || '--'}
              </Text>
              <Text variant="bodySmall">%</Text>
              <Text variant="bodySmall" style={{ opacity: 0.6 }}>Blood Oxygen</Text>
            </Card.Content>
          </Card>
        </View>

        {/* Secondary Metrics */}
        <Card mode="outlined" style={{ marginBottom: 16 }}>
          <Card.Content>
            <List.Item
              title="Steps Today"
              description={healthData?.steps?.toLocaleString() || 'No data'}
              left={props => <List.Icon {...props} icon="walk" />}
              right={() => (
                <Text variant="titleLarge">
                  {healthData?.steps?.toLocaleString() || '--'}
                </Text>
              )}
            />
            <Divider />
            <List.Item
              title="Temperature"
              description="Body temperature"
              left={props => <List.Icon {...props} icon="thermometer" />}
              right={() => (
                <Text variant="titleLarge">
                  {healthData?.temperature ? `${healthData.temperature.toFixed(1)}°C` : '--'}
                </Text>
              )}
            />
            <Divider />
            <List.Item
              title="Battery"
              description="Device battery level"
              left={props => <List.Icon {...props} icon="battery" />}
              right={() => (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="titleMedium">
                    {healthData?.battery || '--'}%
                  </Text>
                  {healthData?.battery && (
                    <ProgressBar 
                      progress={healthData.battery / 100} 
                      color={healthData.battery > 20 ? paperTheme.colors.primary : paperTheme.colors.error}
                      style={{ width: 60, marginTop: 4 }}
                    />
                  )}
                </View>
              )}
            />
          </Card.Content>
        </Card>

        {/* Recent History */}
        {dataHistory.length > 0 && (
          <Card mode="outlined" style={{ marginBottom: 16 }}>
            <Card.Title title="Recent Readings" />
            <Card.Content>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {dataHistory.slice(0, 10).map((data, index) => (
                  <View key={index} style={{ 
                    marginRight: 16, 
                    padding: 8, 
                    backgroundColor: theme.colors.surfaceVariant,
                    borderRadius: 8,
                    minWidth: 80,
                    alignItems: 'center'
                  }}>
                    <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                      {new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {data.heartRate && (
                      <View style={{ alignItems: 'center', marginTop: 4 }}>
                        <IconButton icon="heart" size={16} style={{ margin: 0 }} />
                        <Text variant="bodyMedium">{data.heartRate}</Text>
                      </View>
                    )}
                    {data.spo2 && (
                      <View style={{ alignItems: 'center', marginTop: 4 }}>
                        <Text variant="bodySmall">SpO₂</Text>
                        <Text variant="bodyMedium">{data.spo2}%</Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </Card.Content>
          </Card>
        )}

        {/* Sleep Data */}
        {sleepData.length > 0 && (
          <Card mode="outlined">
            <Card.Title title="Sleep History" />
            <Card.Content>
              {sleepData.map((sleep, index) => (
                <View key={index} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyMedium">
                      {sleep.startTime.toLocaleDateString()}
                    </Text>
                    <Chip mode="flat" compact>
                      {sleep.quality}
                    </Chip>
                  </View>
                  <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                    {sleep.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                    {sleep.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    ({Math.floor(sleep.duration / 60)}h {sleep.duration % 60}m)
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Last Update */}
        {healthData && (
          <Text variant="bodySmall" style={{ textAlign: 'center', marginTop: 16, opacity: 0.6 }}>
            Last updated: {new Date(healthData.timestamp).toLocaleString()}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}