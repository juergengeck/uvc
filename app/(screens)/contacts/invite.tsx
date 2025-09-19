import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  ScrollView,
  Alert,
  BackHandler,
  Modal,
  Share
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { useModel } from '@src/providers/app/OneProvider';
import { useNetworkSettings } from '@src/hooks/useNetworkSettings';
import { Button } from 'react-native-paper';
import { useInstance } from '@src/providers/app';
import InviteQRCode from '@src/components/contacts/InviteQRCode';
import Constants from 'expo-constants';
import { routes } from '@src/config/routes';

export default function InviteScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation('contacts');
  const { model, initialized } = useModel();
  const { someoneConnections } = useNetworkSettings();
  const insets = useSafeAreaInsets();
  
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaitingForConnection, setIsWaitingForConnection] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const [pairingCompleted, setPairingCompleted] = useState(false);
  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);

  // Handle close function
  const handleClose = () => {
    console.log('[InviteScreen] handleClose called');
    setIsWaitingForConnection(false);
    router.back();
  };

  // Simplified invitation generation logic
  useEffect(() => {
    // We only generate the invitation once the AppModel is fully initialized.
    // The `useModel` hook now provides this state.
    if (initialized) {
      console.log('[InviteScreen] AppModel is initialized, generating invitation...');
      generateInvitation();
    } else {
      console.log('[InviteScreen] Waiting for AppModel to be initialized...');
    }
  }, [initialized]); // This effect runs whenever the `initialized` state changes.

  // Handle back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      console.log('[InviteScreen] back button pressed');
      handleClose();
      return true; // Prevent default back action
    });

    return () => backHandler.remove();
  }, [handleClose]);

  // Monitor pairing completion to detect when someone successfully pairs
  useEffect(() => {
    const currentPairedCount = someoneConnections?.length || 0;
    
    console.log('[InviteScreen] Monitoring pairing - current:', currentPairedCount, 'previous:', connectionCount, 'waiting:', isWaitingForConnection);
    
    // On first load, just set the initial count
    if (connectionCount === 0) {
      console.log('[InviteScreen] Setting initial pairing count:', currentPairedCount);
      setConnectionCount(currentPairedCount);
      return;
    }
    
    // If we have more paired people than before and we're waiting, someone paired successfully
    if (currentPairedCount > connectionCount && isWaitingForConnection) {
      console.log('[InviteScreen] 🎉 NEW PAIRING DETECTED! Count increased from', connectionCount, 'to', currentPairedCount);
      
      console.log('[InviteScreen] Pairing detected - closing modal and going to home');
      handleClose();
      router.replace('/(tabs)/home');
    }
    
    setConnectionCount(currentPairedCount);
  }, [someoneConnections, connectionCount, isWaitingForConnection, router, handleClose]);

  // Additional monitoring for contact creation completion via LeuteAccessRightsManager
  useEffect(() => {
    if (!isWaitingForConnection || !model?.leuteModel) return;
    
    console.log('[InviteScreen] Setting up LeuteModel change listener for contact creation');
    
    // Set up a more aggressive polling mechanism to detect contact changes
    const pollInterval = setInterval(async () => {
      try {
        const currentContacts = await model.leuteModel.others();
        const newContactCount = currentContacts.length;
        
        if (newContactCount > connectionCount && isWaitingForConnection) {
          console.log('[InviteScreen] 🎉 CONTACT CREATION DETECTED via polling! Count increased from', connectionCount, 'to', newContactCount);
          
          // Clear the interval immediately
          clearInterval(pollInterval);
          
          // Set states immediately to prevent multiple triggers
          console.log('[InviteScreen] Contact created - closing modal and going to home');
          handleClose();
          router.replace('/(tabs)/home');
        }
      } catch (error) {
        console.error('[InviteScreen] Error polling for contact changes:', error);
      }
    }, 2000); // Poll every 2 seconds
    
    return () => {
      console.log('[InviteScreen] Clearing contact polling interval');
      clearInterval(pollInterval);
    };
  }, [isWaitingForConnection, model?.leuteModel, connectionCount, router, handleClose]);

  // Add timeout mechanism to prevent getting stuck in waiting state
  useEffect(() => {
    if (!isWaitingForConnection) return;
    
    console.log('[InviteScreen] Setting up connection timeout (5 minutes)');
    const timeoutId = setTimeout(() => {
      if (isWaitingForConnection) {
        console.log('[InviteScreen] ⏰ Connection timeout reached, stopping wait');
        setIsWaitingForConnection(false);
        setConnectionTimedOut(true);
        Alert.alert(
          'Connection Timeout',
          'No connection was established within 5 minutes. This might be due to network issues or app version incompatibility. You can generate a new code or try again.',
          [
            {
              text: 'Generate New Code',
              onPress: () => {
                console.log('[InviteScreen] User chose to generate new code after timeout');
                setConnectionTimedOut(false);
                generateInvitation();
              }
            },
            {
              text: 'Go Back',
              onPress: () => {
                console.log('[InviteScreen] User chose to go back after timeout');
                setConnectionTimedOut(false);
                router.push(routes.tabs.index);
              }
            }
          ]
        );
      }
    }, 5 * 60 * 1000); // 5 minutes timeout
    
    return () => {
      console.log('[InviteScreen] Clearing connection timeout');
      clearTimeout(timeoutId);
    };
  }, [isWaitingForConnection]);

  // Monitor connection events more comprehensively
  // This includes detection of CHUM protocol failures which can occur due to:
  // - Recipe version mismatches (e.g., version_head vs unversioned/versioned/id formats)
  // - Access rights issues (AM-GARH1 errors)
  // - Data parsing errors (DAH-PAO3 errors)
  useEffect(() => {
    if (!model?.connections || !isWaitingForConnection) return;
    
    console.log('[InviteScreen] Setting up connection event listeners');
    
    // Listen for connection events if available
    const connectionsModel = model.connections;
    const eventListeners: Array<() => void> = [];
    
    try {
      // Listen for connection opened events
      if (connectionsModel.onConnectionOpened) {
        const unsubscribeOpened = connectionsModel.onConnectionOpened.listen((connection: any) => {
          console.log('[InviteScreen] 🔗 Connection opened:', connection.id);
          // Don't immediately treat this as success - wait for actual pairing success
        });
        eventListeners.push(unsubscribeOpened);
      }
      
      // Listen for connection closed events (failures)
      if (connectionsModel.onConnectionClosed) {
        const unsubscribeClosed = connectionsModel.onConnectionClosed.listen((connection: any) => {
          console.log('[InviteScreen] 🔴 Connection closed:', connection.id);
          // If we're waiting and a connection closes, it might be a failed pairing attempt
          if (isWaitingForConnection) {
            console.log('[InviteScreen] Connection closed while waiting - checking for protocol errors');
            
            // Check if this is a CHUM protocol failure
            const reason = connection.reason || connection.closeReason || '';
            const isChumError = reason.includes('CHUM') || 
                              reason.includes('DAH-PAO3') ||
                              reason.includes('Expected unversioned') ||
                              reason.includes('version_head') ||
                              reason.includes('AM-GARH1');
            
            if (isChumError) {
              console.log('[InviteScreen] 🚨 CHUM protocol failure detected:', reason);
              setIsWaitingForConnection(false);
              
              Alert.alert(
                'Connection Failed',
                'The connection failed due to a protocol incompatibility. This may be due to different app versions. Please try again or contact support if the issue persists.',
                [
                  {
                    text: 'Generate New Code',
                    onPress: () => {
                      console.log('[InviteScreen] User chose to generate new code after CHUM failure');
                      generateInvitation();
                    }
                  },
                  {
                    text: 'Go Back',
                    onPress: () => {
                      console.log('[InviteScreen] User chose to go back after CHUM failure');
                      router.push(routes.tabs.index);
                    }
                  }
                ]
              );
            } else {
              console.log('[InviteScreen] Connection closed but not a recognized protocol error');
              // Don't immediately stop waiting as there might be other attempts
            }
          }
        });
        eventListeners.push(unsubscribeClosed);
      }
      
    } catch (error) {
      console.error('[InviteScreen] Error setting up connection event listeners:', error);
    }
    
    return () => {
      console.log('[InviteScreen] Cleaning up connection event listeners');
      eventListeners.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.error('[InviteScreen] Error cleaning up event listener:', error);
        }
      });
    };
  }, [model?.connections, isWaitingForConnection, router]);

  // Direct listener for pairing success events from ConnectionsModel to ensure UI updates immediately
  useEffect(() => {
    if (!model?.connections || !isWaitingForConnection) return;

    const pairingApi = (model.connections as any).pairing;
    if (!pairingApi || !pairingApi.onPairingSuccess || typeof pairingApi.onPairingSuccess.listen !== 'function') {
      console.log('[InviteScreen] pairing.onPairingSuccess not available');
      return;
    }

    console.log('[InviteScreen] Subscribing to pairing.onPairingSuccess events');
    const unsubscribe = pairingApi.onPairingSuccess.listen(() => {
      console.log('[InviteScreen] 🎉 pairing.onPairingSuccess event received');
      if (isWaitingForConnection) {
        console.log('[InviteScreen] Pairing successful - closing modal and going to home');
        handleClose();
        router.replace('/(tabs)/home');
      }
    });

    return () => {
      console.log('[InviteScreen] Unsubscribing from pairing.onPairingSuccess');
      unsubscribe?.remove?.();
    };
  }, [model?.connections, isWaitingForConnection, router, handleClose]);

  // NOTE: Pairing success is now handled automatically by LeuteAccessRightsManager
  // based on one.leute reference implementation. UI notifications should be 
  // handled via app state changes rather than direct pairing event listeners.

  // Generate invitation URL - now called after app is fully initialized
  const generateInvitation = useCallback(async () => {
    if (isGenerating) return; // Prevent multiple simultaneous generations
    
    setIsGenerating(true);
    setError(null);
    setConnectionTimedOut(false);
    
    try {
      if (!model || !model.leuteModel) {
        throw new Error('LeuteModel not available');
      }

      if (!model.inviteManager) {
        throw new Error('InviteManager not available - app may not be fully initialized');
      }
      
      console.log('[InviteScreen] Generating invitation...');
      const url = await model.inviteManager.generateInvitationUrl();
      setInviteUrl(url);
      setIsWaitingForConnection(true); // Start waiting for connections
      console.log('[InviteScreen] ✅ Generated invitation URL successfully');
      
    } catch (err) {
      console.error('[InviteScreen] Failed to generate invitation:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate invitation');
    } finally {
      setIsGenerating(false);
    }
  }, [model, isGenerating]);

  // Copy invitation to clipboard
  const copyInvitation = useCallback(async () => {
    if (!inviteUrl) {
      Alert.alert('Error', 'No invitation link available to copy.');
      return;
    }

    try {
      console.log('[InviteScreen] 📋 Copying to clipboard, URL length:', inviteUrl.length);
      console.log('[InviteScreen] 📋 URL preview:', inviteUrl.substring(0, 100) + '...');
      
      await Clipboard.setStringAsync(inviteUrl);
      
      // Verify what was actually copied
      const copiedContent = await Clipboard.getStringAsync();
      console.log('[InviteScreen] 📋 Verification - copied length:', copiedContent.length);
      console.log('[InviteScreen] 📋 Verification - matches original:', copiedContent === inviteUrl);
      
      if (copiedContent === inviteUrl) {
        // Silently succeed - no alert needed
      } else {
        console.error('[InviteScreen] ❌ Clipboard corruption detected!');
        Alert.alert('Warning', 'Link copied but may be corrupted. Try generating a new code.');
      }
    } catch (error) {
      console.error('Clipboard error:', error);
      Alert.alert('Error', 'Failed to copy invitation link to clipboard.');
    }
  }, [inviteUrl]);

  const renderContent = () => {
    // Show pairing success state
    
    // If the app isn't initialized, show a loading indicator.
    if (!initialized || isGenerating) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.statusText, { color: theme.colors.onSurface }]}>
            {isGenerating ? 'Generating Secure Code...' : 'Initializing Connection...'}
          </Text>
        </View>
      );
    }
    
    if (error) {
      return (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {error}
          </Text>
          <TouchableOpacity onPress={generateInvitation} style={[styles.retryButton, { borderColor: theme.colors.error }]}>
            <Text style={[styles.retryButtonText, { color: theme.colors.error }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (inviteUrl) {
      return (
        <>
          <View style={[styles.qrCodeContainer, { backgroundColor: theme.colors.surface }]}>
            <QRCode
              value={inviteUrl}
              size={250}
              backgroundColor={theme.colors.surface}
              color={theme.colors.onSurface}
            />
          </View>
          <Text style={[styles.instructionText, { color: theme.colors.onSurface }]}>
            {isWaitingForConnection 
              ? 'Waiting for someone to scan and connect...' 
              : connectionTimedOut
              ? 'Connection timed out. You can generate a new code or try again.'
              : t('invite.scan_qr_code')
            }
          </Text>
          
          {isWaitingForConnection && (
            <View style={styles.waitingIndicator}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.waitingText, { color: theme.colors.primary }]}>
                Listening for connections
              </Text>
            </View>
          )}
          
          <TouchableOpacity onPress={copyInvitation} style={[styles.copyButton, { borderColor: theme.colors.primary }]}>
            <Ionicons name="copy-outline" size={24} color={theme.colors.primary} />
            <Text style={[styles.copyButtonText, { color: theme.colors.primary }]}>
              Copy Link
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={generateInvitation} style={[styles.regenerateButton, { borderColor: theme.colors.primary }]}>
            <Ionicons name="refresh-outline" size={24} color={theme.colors.primary} />
            <Text style={[styles.regenerateButtonText, { color: theme.colors.primary }]}>
              {t('invite.regenerate_code')}
            </Text>
          </TouchableOpacity>

          {isWaitingForConnection && (
            <TouchableOpacity 
              onPress={() => {
                console.log('[InviteScreen] User manually stopped waiting for connections');
                setIsWaitingForConnection(false);
              }} 
              style={[styles.stopWaitingButton, { borderColor: theme.colors.outline }]}
            >
              <Ionicons name="stop-outline" size={24} color={theme.colors.outline} />
              <Text style={[styles.stopWaitingButtonText, { color: theme.colors.outline }]}>
                Stop Waiting
              </Text>
            </TouchableOpacity>
          )}

        </>
      );
    }

    return null; // Should not happen if logic is correct
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <SafeAreaView style={[styles.inviteModalContainer, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.inviteModalHeader, { backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.outline }]}>
            <TouchableOpacity
              style={styles.inviteModalCloseButton}
              onPress={handleClose}
            >
              <Ionicons name="close" size={28} color={theme.colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.inviteModalTitle, { color: theme.colors.onSurface }]}>Invite Person</Text>
          </View>
          
          <ScrollView style={[styles.inviteModalContent, { backgroundColor: theme.colors.background }]}>
            {renderContent()}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  inviteModalContainer: {
    flex: 1,
    backgroundColor: 'transparent', // Will be set dynamically
    paddingTop: 50,
  },
  inviteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  inviteModalCloseButton: {
    padding: 8,
  },
  inviteModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
    color: 'transparent', // Will be set dynamically
  },
  inviteModalContent: {
    flex: 1,
    padding: 16,
    backgroundColor: 'transparent', // Will be set dynamically
  },
  inviteDescription: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  inviteLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  inviteLoadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  qrCodeContainer: {
    alignItems: 'center',
    borderRadius: 12,
    padding: 24,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inviteInstructions: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  regenerateButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    minWidth: 120,
  },
  regenerateButtonText: {
    fontSize: 17,
    fontWeight: '400',
  },
  copyButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    minWidth: 120,
  },
  copyButtonText: {
    fontSize: 17,
    fontWeight: '400',
  },
  inviteErrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  inviteErrorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 17,
    fontWeight: '400',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusText: {
    marginTop: 20,
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 20,
    fontSize: 16,
    textAlign: 'center',
    color: 'red',
  },
  instructionText: {
    marginTop: 20,
    fontSize: 16,
    textAlign: 'center',
  },
  waitingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  waitingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  stopWaitingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    minWidth: 120,
  },
  stopWaitingButtonText: {
    fontSize: 17,
    fontWeight: '400',
  },
}); 