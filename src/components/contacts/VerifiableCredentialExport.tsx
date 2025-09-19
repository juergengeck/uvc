/**
 * VerifiableCredentialExport Component
 * 
 * This component allows exporting verifiable credentials of ownership
 * from a user profile in the contacts view.
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme, List } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import VerifiableCredentialModel from '../../models/credentials/VerifiableCredentialModel';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { Person } from '@refinio/one.core/lib/recipes.js';
import { useAppModel } from '../../hooks/useAppModel';
import type { Device } from '../../models/network/DeviceDiscoveryModel';

interface VerifiableCredentialExportProps {
  personId: SHA256IdHash<Person>;
  visible: boolean;
  onDismiss: () => void;
}

const VerifiableCredentialExport: React.FC<VerifiableCredentialExportProps> = ({
  personId,
  visible,
  onDismiss
}) => {
  const { t } = useTranslation('contacts');
  const theme = useTheme();
  const { appModel } = useAppModel();
  
  // States
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [credentialCreated, setCredentialCreated] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load discovered devices
  const loadDevices = useCallback(async () => {
    if (!appModel) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get the discovery model from app model
      const deviceDiscoveryModel = appModel.deviceDiscoveryModel;
      if (!deviceDiscoveryModel) {
        throw new Error('Device discovery model not available');
      }
      
      // Initialize if needed
      await deviceDiscoveryModel.init();
      
      // Get discovered devices
      const discoveredDevices = deviceDiscoveryModel.getDevices();
      setDevices(discoveredDevices);
      
      // Reset states
      setSelectedDevice(null);
      setCredentialCreated(false);
      setFlashSuccess(false);
    } catch (err) {
      setError(`Failed to load devices: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [appModel]);
  
  // Handle device selection
  const handleSelectDevice = useCallback((device: Device) => {
    setSelectedDevice(device);
    setFlashSuccess(false);
  }, []);
  
  // Create and export verifiable credential
  const handleExportCredential = useCallback(async () => {
    if (!appModel || !selectedDevice) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Initialize the verifiable credential model
      const credentialModel = await VerifiableCredentialModel.ensureInitialized(appModel.leuteModel);
      
      // Create a verifiable credential for device ownership
      const credential = await credentialModel.createDeviceOwnershipCredential(
        personId,
        selectedDevice.id,
        selectedDevice.type,
        // Extract MAC address if available
        undefined, // No MAC address available from DeviceCapabilities interface
        // Set expiration to 1 year from now
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      );
      
      setCredentialCreated(true);
      
      // Flash the credential to the device
      const success = await credentialModel.flashCredentialToESP32(
        credential,
        selectedDevice.address,
        selectedDevice.port
      );
      
      setFlashSuccess(success);
      
      if (success) {
        // Associate the device with the owner
        await credentialModel.associateDeviceWithOwner(personId, selectedDevice.id);
      }
    } catch (err) {
      setError(`Failed to export credential: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [appModel, selectedDevice, personId]);
  
  // Effect to load devices when dialog opens
  React.useEffect(() => {
    if (visible) {
      loadDevices();
    }
  }, [visible, loadDevices]);
  
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{t('verifiableCredentials.title')}</Dialog.Title>
        
        <Dialog.Content>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>{t('common:loading')}</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
              <Button mode="contained" onPress={loadDevices} style={styles.retryButton}>
                {t('common:retry')}
              </Button>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('verifiableCredentials.noDevices')}</Text>
              <Button mode="contained" onPress={loadDevices} style={styles.refreshButton}>
                {t('verifiableCredentials.refresh')}
              </Button>
            </View>
          ) : (
            <ScrollView style={styles.deviceListContainer}>
              <Text style={styles.subtitle}>{t('verifiableCredentials.selectDevice')}</Text>
              
              {devices.map(device => (
                <List.Item
                  key={device.id}
                  title={device.name}
                  description={`${device.type} - ${device.address}:${device.port}`}
                  left={props => <List.Icon {...props} icon="devices" />}
                  onPress={() => handleSelectDevice(device)}
                  style={[
                    styles.deviceItem,
                    selectedDevice?.id === device.id && {
                      backgroundColor: theme.colors.primaryContainer
                    }
                  ]}
                />
              ))}
              
              {selectedDevice && (
                <View style={styles.selectedDeviceContainer}>
                  <Text style={styles.selectedDeviceText}>
                    {t('verifiableCredentials.selectedDevice', { device: selectedDevice.name })}
                  </Text>
                  
                  <Button
                    mode="contained"
                    onPress={handleExportCredential}
                    style={styles.exportButton}
                    disabled={loading || credentialCreated}
                  >
                    {t('verifiableCredentials.export')}
                  </Button>
                  
                  {credentialCreated && (
                    <View style={styles.resultContainer}>
                      {flashSuccess ? (
                        <Text style={[styles.successText, { color: theme.colors.primary }]}>
                          {t('verifiableCredentials.exportSuccess')}
                        </Text>
                      ) : (
                        <Text style={[styles.errorText, { color: theme.colors.error }]}>
                          {t('verifiableCredentials.exportFailed')}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </Dialog.Content>
        
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t('common:close')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '80%',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginBottom: 10,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginBottom: 10,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 10,
  },
  deviceListContainer: {
    maxHeight: 300,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  deviceItem: {
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedDeviceContainer: {
    marginTop: 20,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedDeviceText: {
    fontWeight: 'bold',
    marginBottom: 10,
  },
  exportButton: {
    marginTop: 10,
  },
  resultContainer: {
    marginTop: 15,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  successText: {
    fontWeight: 'bold',
  },
});

export default VerifiableCredentialExport; 