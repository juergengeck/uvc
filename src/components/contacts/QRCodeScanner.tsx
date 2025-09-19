/**
 * QRCodeScanner Component
 * 
 * Uses expo-camera to scan QR codes for adding contacts.
 * Based on the pattern in one.leute but adapted for Expo.
 */

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Camera } from 'expo-camera';
import { useTheme, IconButton } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

interface QRCodeScannerProps {
  /**
   * Called when a valid QR code is scanned
   */
  onScan: (data: string) => void;
  
  /**
   * Called when the user cancels scanning
   */
  onCancel: () => void;
}

export default function QRCodeScanner({ onScan, onCancel }: QRCodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(true);
  const theme = useTheme();
  const { t } = useTranslation();

  useEffect(() => {
    // Request camera permission
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ type, data }: { type: string, data: string }) => {
    if (!scanning) return;
    
    // Process all QR codes
    setScanning(false);
    onScan(data);
  };

  // Handle permission states
  if (hasPermission === null) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.onBackground }}>
          {t('contacts:scanner.requesting_permission')}
        </Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.onBackground }}>
          {t('contacts:scanner.no_access')}
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.primary }]}
          onPress={onCancel}
        >
          <Text style={{ color: theme.colors.onPrimary }}>
            {t('common:actions.close')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        type={Camera.Constants.Type.back}
        onBarCodeScanned={scanning ? handleBarCodeScanned : undefined}
      >
        <View style={styles.overlay}>
          <View style={styles.scannerFrame} />
        </View>
        
        <View style={styles.buttonContainer}>
          <IconButton
            icon="close"
            size={30}
            iconColor="white"
            onPress={onCancel}
            style={styles.closeButton}
          />
        </View>
        
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            {t('contacts:scanner.instructions')}
          </Text>
        </View>
      </Camera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    backgroundColor: 'transparent',
  },
  buttonContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  closeButton: {
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionsText: {
    color: 'white',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16,
    borderRadius: 8,
    marginHorizontal: 32,
  },
  button: {
    padding: 15,
    borderRadius: 5,
    marginTop: 20,
  },
}); 