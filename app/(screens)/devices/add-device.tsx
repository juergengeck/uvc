import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, useTheme, Text, HelperText, Card, Title, RadioButton, Chip, IconButton } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { Room, Department, Device } from '@OneObjectInterfaces';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

interface RoomWithDept {
  id: string;
  name: string;
  departmentName: string;
}

const DEVICE_TYPES = [
  { label: 'ESP32', value: 'ESP32', icon: 'chip' },
  { label: 'Computer', value: 'Computer', icon: 'desktop-classic' },
  { label: 'Phone', value: 'Phone', icon: 'cellphone' },
  { label: 'Tablet', value: 'Tablet', icon: 'tablet' },
  { label: 'IoT Device', value: 'IoT', icon: 'access-point' },
  { label: 'Other', value: 'Other', icon: 'devices' },
];

const CAPABILITIES = [
  'Temperature Sensor',
  'Humidity Sensor',
  'Motion Detection',
  'Camera',
  'Microphone',
  'Speaker',
  'Display',
  'Bluetooth',
  'WiFi',
  'QUIC',
  'UDP',
];

export default function AddDeviceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation(Namespaces.CONTACTS);
  const { instance, models } = useInstance();
  
  const [deviceId, setDeviceId] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [address, setAddress] = useState('');
  const [port, setPort] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [rooms, setRooms] = useState<RoomWithDept[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load available rooms
  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    // Temporary: Set empty list until we have proper storage query
    setLoadingRooms(false);
    setRooms([]);
    
    // TODO: Implement proper room querying when storage API is available
    /*
    try {
      setLoadingRooms(true);
      // Query rooms from storage
    } catch (err) {
      console.error('[AddDevice] Error loading rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
    */
  };

  const toggleCapability = (capability: string) => {
    setSelectedCapabilities(prev => 
      prev.includes(capability)
        ? prev.filter(c => c !== capability)
        : [...prev, capability]
    );
  };

  const handleCreate = async () => {
    setError(null);

    if (!deviceId.trim()) {
      setError('Device ID is required');
      return;
    }

    if (!deviceType) {
      setError('Please select a device type');
      return;
    }

    if (!address.trim()) {
      setError('Device address is required');
      return;
    }

    if (!port.trim() || isNaN(Number(port))) {
      setError('Valid port number is required');
      return;
    }

    if (!models?.leuteModel) {
      setError('System not ready. Please try again.');
      return;
    }

    setIsLoading(true);

    try {
      // Get the current user's person ID
      const personId = await models.leuteModel.myMainIdentity();
      
      // Create the device object
      const device: Device = {
        $type$: 'Device',
        instance: personId,
        deviceId: deviceId.trim(),
        deviceType,
        address: address.trim(),
        port: Number(port),
        capabilities: selectedCapabilities,
        macAddress: macAddress.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
        firmwareVersion: firmwareVersion.trim() || undefined,
        hasValidCredential: false,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      };

      // Store the device
      const deviceHash = await storeUnversionedObject(device);

      // If a room is selected, we'll need to update it once storage query is available
      if (selectedRoom) {
        // TODO: Update room to include this device when storage API is available
        console.log('[AddDevice] Room selected:', selectedRoom, 'Device hash:', deviceHash);
      }

      console.log('[AddDevice] Device created with hash:', deviceHash);
      
      // Navigate back immediately
      router.back();
    } catch (err) {
      console.error('[AddDevice] Error creating device:', err);
      setError('Failed to add device. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Add Device',
          headerStyle: {
            backgroundColor: theme.colors.surface,
          },
          headerTintColor: theme.colors.onSurface,
        }}
      />
      
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.contentContainer}
      >
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.title}>New Device</Title>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              Add a new device to the system
            </Text>

            <View style={styles.formSection}>
              {/* Device Type Selection */}
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Device Type *
              </Text>
              <View style={styles.chipContainer}>
                {DEVICE_TYPES.map((type) => (
                  <Chip
                    key={type.value}
                    selected={deviceType === type.value}
                    onPress={() => setDeviceType(type.value)}
                    style={styles.chip}
                    icon={type.icon}
                  >
                    {type.label}
                  </Chip>
                ))}
              </View>

              {/* Basic Information */}
              <TextInput
                label="Device ID *"
                value={deviceId}
                onChangeText={setDeviceId}
                mode="outlined"
                placeholder="Enter unique device ID"
                error={!!error && !deviceId.trim()}
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
              />

              <View style={styles.rowInputs}>
                <TextInput
                  label="Address (IP) *"
                  value={address}
                  onChangeText={setAddress}
                  mode="outlined"
                  placeholder="192.168.1.100"
                  error={!!error && !address.trim()}
                  style={[styles.input, styles.halfInput]}
                  outlineColor={theme.colors.primary}
                  activeOutlineColor={theme.colors.primary}
                />
                
                <TextInput
                  label="Port *"
                  value={port}
                  onChangeText={setPort}
                  mode="outlined"
                  placeholder="8080"
                  keyboardType="numeric"
                  error={!!error && (!port.trim() || isNaN(Number(port)))}
                  style={[styles.input, styles.halfInput]}
                  outlineColor={theme.colors.primary}
                  activeOutlineColor={theme.colors.primary}
                />
              </View>

              {/* Optional Information */}
              <TextInput
                label="MAC Address"
                value={macAddress}
                onChangeText={setMacAddress}
                mode="outlined"
                placeholder="00:00:00:00:00:00"
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
              />

              <TextInput
                label="Serial Number"
                value={serialNumber}
                onChangeText={setSerialNumber}
                mode="outlined"
                placeholder="Enter serial number"
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
              />

              <TextInput
                label="Firmware Version"
                value={firmwareVersion}
                onChangeText={setFirmwareVersion}
                mode="outlined"
                placeholder="v1.0.0"
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
              />

              {/* Capabilities */}
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginTop: 16 }]}>
                Capabilities
              </Text>
              <View style={styles.chipContainer}>
                {CAPABILITIES.map((capability) => (
                  <Chip
                    key={capability}
                    selected={selectedCapabilities.includes(capability)}
                    onPress={() => toggleCapability(capability)}
                    style={styles.chip}
                  >
                    {capability}
                  </Chip>
                ))}
              </View>

              {/* Room Assignment */}
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginTop: 16 }]}>
                Assign to Room (Optional)
              </Text>
              
              {loadingRooms ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading rooms...</Text>
              ) : rooms.length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  No rooms available. Device will be created without room assignment.
                </Text>
              ) : (
                <RadioButton.Group 
                  onValueChange={setSelectedRoom} 
                  value={selectedRoom}
                >
                  <RadioButton.Item
                    label="No Room Assignment"
                    value=""
                    style={styles.radioItem}
                    labelStyle={{ color: theme.colors.onSurface }}
                  />
                  {rooms.map((room) => (
                    <RadioButton.Item
                      key={room.id}
                      label={`${room.name} (${room.departmentName})`}
                      value={room.id}
                      style={styles.radioItem}
                      labelStyle={{ color: theme.colors.onSurface }}
                    />
                  ))}
                </RadioButton.Group>
              )}

              {error && (
                <HelperText type="error" visible={true}>
                  {error}
                </HelperText>
              )}
            </View>

            <View style={styles.buttonContainer}>
              <Button
                mode="outlined"
                onPress={() => router.back()}
                disabled={isLoading}
                style={styles.button}
                textColor={theme.colors.primary}
              >
                Cancel
              </Button>
              
              <Button
                mode="contained"
                onPress={handleCreate}
                loading={isLoading}
                disabled={isLoading || !deviceId.trim() || !deviceType || !address.trim() || !port.trim()}
                style={styles.button}
                buttonColor={theme.colors.primary}
              >
                Add Device
              </Button>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    marginBottom: 16,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    marginBottom: 4,
  },
  radioItem: {
    paddingVertical: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    minWidth: 120,
  },
});