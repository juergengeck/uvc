import React from 'react';
import { View, Text } from 'react-native';
import { List, Switch, IconButton, Surface, Button, ActivityIndicator } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '@src/providers/app/AppTheme';
import { LEDControl } from './LEDControl';
import { DeviceType, getDeviceTypeIcon } from '@src/models/network/deviceTypes';

export interface Device {
  id: string;
  name: string;
  type: string;
  address: string;
  port: number;
  connected: boolean;  // authenticated with VC
  online?: boolean;     // discovered or heartbeat responding
  enabled?: boolean;
  lastSeen?: number;
  ownerId?: string;
  blueLedStatus?: 'on' | 'off' | 'blink';
  isSaved?: boolean;   // device is saved in settings
  wifiStatus?: 'active' | 'inactive';  // WiFi connectivity status
  btleStatus?: 'active' | 'inactive';  // Bluetooth LE connectivity status
  isAuthenticated?: boolean;
  hasValidCredential?: boolean;
  publicKey?: string;
  rssi?: number;
  discoveryMethod?: 'UDP' | 'BTLE';
  organisationPath?: string; // Organisation - Department - Room path
}

interface DeviceItemProps {
  device: Device;
  isOwnedByCurrentUser: boolean;
  isOwnedBySomeoneElse: boolean;
  isLoading: boolean;
  isLEDPending?: boolean;
  onToggleOwnership: (device: Device) => void;
  onRemove: (device: Device) => void;
  onViewDetails: (device: Device) => void;
  onToggleLED?: (device: Device) => void;
  onRetryAuth?: (device: Device) => void;
  onAddToRoom?: (device: Device) => void;
}

export const DeviceItem = React.memo(function DeviceItem({
  device,
  isOwnedByCurrentUser,
  isOwnedBySomeoneElse,
  isLoading,
  isLEDPending = false,
  onToggleOwnership,
  onRemove,
  onViewDetails,
  onToggleLED,
  onRetryAuth,
  onAddToRoom
}: DeviceItemProps) {
  const { styles: themedStyles } = useTheme();
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState(false);

  const handleExpandToggle = React.useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Memoize expensive computations
  const lastSeenText = React.useMemo(() =>
    device.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : 'Never',
    [device.lastSeen]
  );

  const statusText = device.online ? 'Online' : 'Offline';
  const connectionText = device.connected ? ' • Connected' : '';
  const savedText = device.isSaved && !device.online ? ' • Saved' : '';

  const briefDescription = `${device.type} • ${statusText}${connectionText}${savedText}`;

  const switchValue = isOwnedByCurrentUser;
  const switchDisabled = isOwnedBySomeoneElse;

  const deviceIcon = getDeviceTypeIcon(device.type);

  // Memoize LED control props
  const shouldEnableLED = isOwnedByCurrentUser && device.connected && !isLoading;
  const ledHandler = shouldEnableLED ? onToggleLED : undefined;
  
  return (
    <Surface style={themedStyles.card} elevation={1}>
      <View style={{ position: 'relative' }}>
        {/* Main content - no opacity change during loading */}
        <View>
          <List.Item
            title={device.name}
            description={briefDescription}
            descriptionNumberOfLines={1}
            disabled={false}
            left={() => (
              <View style={{ paddingHorizontal: 16, justifyContent: 'center' }}>
                {device.type === DeviceType.ESP32 ? (
                  <LEDControl
                    device={device}
                    onToggleLED={ledHandler}
                    isLoading={isLoading}
                    isPending={isLEDPending}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={deviceIcon}
                    size={24}
                    color={theme.colors?.onSurfaceVariant || '#666'}
                  />
                )}
              </View>
            )}
            right={() => (
              <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                {/* WiFi and BTLE Status Icons - positioned at top right */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  {device.wifiStatus && (
                    <MaterialCommunityIcons
                      name="wifi"
                      size={16}
                      color={device.wifiStatus === 'active' ? theme.colors?.primary : theme.colors?.onSurfaceVariant}
                      style={{ marginRight: 4, opacity: device.wifiStatus === 'active' ? 1.0 : 0.4 }}
                    />
                  )}
                  
                  {device.btleStatus && (
                    <MaterialCommunityIcons
                      name="bluetooth"
                      size={16}
                      color={device.btleStatus === 'active' ? theme.colors?.primary : theme.colors?.onSurfaceVariant}
                      style={{ opacity: device.btleStatus === 'active' ? 1.0 : 0.4 }}
                    />
                  )}
                </View>
                
                {/* Expand/Collapse Button - positioned below icons */}
                <IconButton
                  icon={expanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  onPress={handleExpandToggle}
                  disabled={false}
                  style={{ margin: 0 }}
                />
              </View>
            )}
            style={{ paddingVertical: 8 }}
          />
          {expanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 0 }}>
              <View style={{ paddingLeft: 56 }}>
                <Text style={{ color: theme.colors?.onSurfaceVariant, fontSize: 14, marginBottom: 4 }}>
                  Address: {device.address}:{device.port}
                </Text>
                <Text style={{ color: theme.colors?.onSurfaceVariant, fontSize: 14, marginBottom: 4 }}>
                  Last seen: {lastSeenText}
                </Text>
                {device.ownerId && (
                  <Text style={{ color: theme.colors?.onSurfaceVariant, fontSize: 14, marginBottom: 4 }}>
                    Owner: {device.ownerId.substring(0, 16)}...
                  </Text>
                )}
                <Text style={{ color: theme.colors?.onSurfaceVariant, fontSize: 14, marginBottom: 8 }}>
                  ID: {device.id}
                </Text>
                
                {/* Organisation Path or Add to Room button for owned devices */}
                {isOwnedByCurrentUser && (
                  <View style={{ marginBottom: 8 }}>
                    {device.organisationPath ? (
                      <View style={{ backgroundColor: theme.colors?.surfaceVariant, padding: 8, borderRadius: 4 }}>
                        <Text style={{ color: theme.colors?.primary, fontSize: 12, fontWeight: '500', marginBottom: 2 }}>
                          LOCATION
                        </Text>
                        <Text style={{ color: theme.colors?.onSurfaceVariant, fontSize: 14 }}>
                          {device.organisationPath}
                        </Text>
                      </View>
                    ) : (
                      <Button
                        mode="outlined"
                        onPress={() => onAddToRoom?.(device)}
                        disabled={!onAddToRoom}
                        compact
                        icon="home-plus"
                        style={{ marginTop: 4 }}
                      >
                        Add to Room
                      </Button>
                    )}
                  </View>
                )}
                
                {/* Authentication Status for ESP32 */}
                {device.type === DeviceType.ESP32 && isOwnedByCurrentUser && !device.connected && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: theme.colors?.error, fontSize: 14, marginBottom: 4 }}>
                      ⚠️ Device not authenticated - LED control disabled
                    </Text>
                    <Text style={{ color: theme.colors?.onSurfaceVariant, fontSize: 12, marginBottom: 8 }}>
                      Authentication will be retried automatically
                    </Text>
                    {onRetryAuth && (
                      <Button
                        mode="outlined"
                        onPress={() => onRetryAuth(device)}
                        disabled={false}
                        compact
                        style={{ marginTop: 4 }}
                      >
                        Retry Authentication
                      </Button>
                    )}
                  </View>
                )}
                
                {/* Ownership Toggle and QR Code */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  {!isLoading ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Switch
                          value={switchValue}
                          onValueChange={() => onToggleOwnership(device)}
                          disabled={switchDisabled}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={{ color: theme.colors?.onSurfaceVariant, fontSize: 14 }}>
                          {isOwnedByCurrentUser ? 'Remove Ownership' : isOwnedBySomeoneElse ? 'Owned by Another User' : 'Take Ownership'}
                        </Text>
                      </View>
                      <IconButton
                        icon="qrcode"
                        size={24}
                        onPress={() => console.log('[DeviceItem] QR code pressed for device:', device.id)}
                        disabled={false}
                      />
                    </>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
        
      </View>
    </Surface>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if important props change
  return (
    prevProps.device.id === nextProps.device.id &&
    prevProps.device.blueLedStatus === nextProps.device.blueLedStatus &&
    prevProps.device.connected === nextProps.device.connected &&
    prevProps.device.online === nextProps.device.online &&
    prevProps.device.ownerId === nextProps.device.ownerId &&
    prevProps.device.wifiStatus === nextProps.device.wifiStatus &&
    prevProps.device.btleStatus === nextProps.device.btleStatus &&
    prevProps.isOwnedByCurrentUser === nextProps.isOwnedByCurrentUser &&
    prevProps.isOwnedBySomeoneElse === nextProps.isOwnedBySomeoneElse &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.isLEDPending === nextProps.isLEDPending
  );
});