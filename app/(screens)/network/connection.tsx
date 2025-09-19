import React, { useState, useEffect } from 'react';
import { 
  View, 
  ScrollView, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  Modal, 
  Alert,
  Text as RNText,
  Platform
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { Button, Text, ActivityIndicator, List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetworkSettings } from '@src/hooks/useNetworkSettings';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import Clipboard from '@react-native-clipboard/clipboard';
import CameraView from 'expo-camera/build/CameraView';
import type { BarcodeScanningResult } from 'expo-camera/build/Camera.types';

/**
 * Network Connection Settings Screen
 * 
 * Dedicated view for managing connections (invitations, devices, contacts)
 */
export default function NetworkConnectionScreen() {
  const { t } = useTranslation();
  const { theme, styles: themedStyles } = useTheme();
  const router = useRouter();
  
  // State management
  const [invitationLink, setInvitationLink] = useState('');
  const [isProcessingInvitation, setIsProcessingInvitation] = useState(false);
  const [isInvitePersonVisible, setIsInvitePersonVisible] = useState(false);
  const [inviteQRData, setInviteQRData] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [invitationType, setInvitationType] = useState<'person' | 'device'>('person');
  const [isQRScannerVisible, setIsQRScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [qrScanError, setQrScanError] = useState<string | null>(null);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);
  const [myPersonName, setMyPersonName] = useState<string>('Me');
  
  // Use network settings hook
  const {
    liveConnections,
    someoneConnections,
    acceptInvitationFromUrl,
  } = useNetworkSettings();
  
  // Get current user's Person ID
  useEffect(() => {
    const getCurrentUserPersonId = async () => {
      try {
        const { ModelService } = await import('@src/services/ModelService');
        const appModel = ModelService.getModel();
        if (appModel?.leuteModel && typeof appModel.leuteModel.myMainIdentity === 'function') {
          const personId = await appModel.leuteModel.myMainIdentity();
          setMyPersonId(personId);
          
          try {
            const mainProfile = await appModel.leuteModel.getMyMainProfile();
            if (mainProfile?.name) {
              setMyPersonName(mainProfile.name);
            } else {
              setMyPersonName(`User ${personId.slice(0, 8)}`);
            }
          } catch (profileError) {
            console.warn('[NetworkConnection] Could not get user profile name:', profileError);
            setMyPersonName(`User ${personId.slice(0, 8)}`);
          }
        }
      } catch (error) {
        console.warn('[NetworkConnection] Could not get current user Person ID:', error);
      }
    };
    
    getCurrentUserPersonId();
  }, []);
  
  // Process invitation URL
  const connectToInvitation = async (invitationUrl: string) => {
    console.log('[NetworkConnection] Processing invitation:', invitationUrl.substring(0, 50) + '...');
    setIsProcessingInvitation(true);
    
    try {
      const { ModelService } = await import('@src/services/ModelService');
      const appModel = ModelService.getModel();
      
      if (!appModel) {
        throw new Error('AppModel not available');
      }

      if (!appModel.inviteManager) {
        throw new Error('InviteManager not available - app may not be fully initialized');
      }
      
      Alert.alert(
        'Connect to Person', 
        `Do you want to connect to this person?\n\nInvitation: ${invitationUrl.substring(0, 50)}...`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setIsProcessingInvitation(false)
          },
          {
            text: 'Connect',
            onPress: async () => {
              try {
                await appModel.inviteManager!.acceptInvitationFromUrl(invitationUrl);
                
                if (inviteQRData) {
                  console.log('[NetworkConnection] Auto-regenerating invitation after successful connection');
                  try {
                    const newInviteUrl = await appModel.inviteManager!.generateInvitationUrl();
                    setInviteQRData(newInviteUrl);
                  } catch (regenError) {
                    console.warn('[NetworkConnection] Failed to auto-regenerate invitation:', regenError);
                  }
                }
                
                setInvitationLink('');
                
                Alert.alert(
                  'Connection Successful!', 
                  'You have successfully connected.',
                  [{ text: 'OK' }]
                );
              } catch (error) {
                console.error('[NetworkConnection] Error processing invitation:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                if (errorMessage.includes('Authentication token is not existing')) {
                  Alert.alert(
                    'Invitation Already Used', 
                    'This invitation link has already been used or expired.',
                    [{ text: 'OK' }]
                  );
                } else if (errorMessage.includes('connection was closed') || errorMessage.includes('Connection failed')) {
                  Alert.alert(
                    'Connection Failed', 
                    'The connection attempt failed. Please try with a fresh invitation link.',
                    [{ text: 'OK' }]
                  );
                } else {
                  Alert.alert('Connection Error', 'Failed to establish connection.');
                }
              } finally {
                setIsProcessingInvitation(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error processing invitation:', errorMessage);
      Alert.alert('Invitation Error', errorMessage);
      setIsProcessingInvitation(false);
    }
  };
  
  // Generate person invitation
  const generatePersonInvitation = async () => {
    setIsGeneratingInvite(true);
    try {
      const { ModelService } = await import('@src/services/ModelService');
      const appModel = ModelService.getModel();
      
      if (!appModel || !appModel.leuteModel) {
        throw new Error('LeuteModel not available');
      }

      if (!appModel.inviteManager) {
        throw new Error('InviteManager not available');
      }
      
      const inviteUrl = await appModel.inviteManager.generateInvitationUrl();
      setInviteQRData(inviteUrl);
      console.log('[NetworkConnection] Generated invitation URL for person successfully');
    } catch (error) {
      console.error('[NetworkConnection] Failed to generate person invitation:', error);
      Alert.alert('Error', 'Failed to generate invitation. Please try again.');
    } finally {
      setIsGeneratingInvite(false);
    }
  };
  
  // Generate device invitation (IOM)
  const generateDeviceInvitation = async () => {
    setIsGeneratingInvite(true);
    try {
      const { ModelService } = await import('@src/services/ModelService');
      const appModel = ModelService.getModel();
      
      if (!appModel || !appModel.leuteModel) {
        throw new Error('LeuteModel not available');
      }

      if (!appModel.inviteManager) {
        throw new Error('InviteManager not available');
      }
      
      const inviteUrl = await appModel.inviteManager.generateInvitationUrl();
      setInviteQRData(inviteUrl);
      console.log('[NetworkConnection] Generated invitation URL for device pairing successfully');
    } catch (error) {
      console.error('[NetworkConnection] Failed to generate device invitation:', error);
      Alert.alert('Error', 'Failed to generate device invitation. Please try again.');
    } finally {
      setIsGeneratingInvite(false);
    }
  };
  
  // Handle add person button press
  const handleAddPersonPress = () => {
    setInvitationType('person');
    setIsInvitePersonVisible(true);
    generatePersonInvitation();
  };
  
  // Handle add device button press
  const handleAddDevicePress = () => {
    setInvitationType('device');
    setIsInvitePersonVisible(true);
    generateDeviceInvitation();
  };
  
  // Copy invitation data to clipboard
  const copyInvitationData = async () => {
    if (inviteQRData) {
      try {
        Clipboard.setString(inviteQRData);
        Alert.alert('Copied!', 'Invitation link copied to clipboard.');
      } catch (error) {
        console.error('[NetworkConnection] Failed to copy to clipboard:', error);
        Alert.alert('Error', 'Failed to copy invitation data.');
      }
    } else {
      Alert.alert('Error', 'No invitation data available to copy.');
    }
  };
  
  // Handle QR scan result
  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    const { type, data } = result;
    setScanned(true);
    
    if (data && (data.startsWith('https://') || data.startsWith('http://') || data.startsWith('refinio:'))) {
      setIsQRScannerVisible(false);
      
      Alert.alert(
        'Connection Invitation',
        `Connect to ${data}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setScanned(false);
            }
          },
          {
            text: 'Connect',
            onPress: () => {
              connectToInvitation(data);
            }
          }
        ]
      );
    } else {
      setQrScanError('Invalid invitation link format');
      setTimeout(() => {
        setScanned(false);
        setQrScanError(null);
      }, 2000);
    }
  };
  
  // Filter connections
  const validConnections = (liveConnections || []).filter((conn: any) => 
    conn && typeof conn === 'object' && conn.summary
  );
  
  const iomConnections = validConnections.filter((conn: any) => 
    myPersonId && conn.remotePersonId === myPersonId
  );
  
  const otherPeopleConnections = validConnections.filter((conn: any) => 
    myPersonId && conn.remotePersonId && conn.remotePersonId !== myPersonId
  );
  
  const styles = StyleSheet.create({
    sectionContent: {
      padding: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    invitationInput: {
      backgroundColor: 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 17,
      color: theme.colors.onSurface,
      borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Platform.select({
        ios: theme.dark ? 'rgba(60, 60, 67, 0.3)' : 'rgba(60, 60, 67, 0.3)',
        default: theme.colors.outline,
      }),
      marginBottom: 16,
    },
    invitationButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    connectButton: {
      flex: 1,
      marginRight: 6,
    },
    qrScanButton: {
      flex: 1,
      marginLeft: 6,
    },
    connectionsList: {
      marginTop: 8,
    },
    connectionItem: {
      backgroundColor: 'transparent',
    },
    connectionInfo: {
      flex: 1,
    },
    connectionName: {
      ...themedStyles.itemTitle,
    },
    connectionDetails: {
      ...themedStyles.itemDescription,
      marginTop: 2,
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
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
    },
    emptyStateText: {
      ...themedStyles.itemDescription,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    modalContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    scannerWrapper: {
      height: '70%',
      width: '90%',
      backgroundColor: theme.colors.background,
      borderRadius: 20,
      overflow: 'hidden',
    },
    scannerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      backgroundColor: theme.colors.surface,
    },
    scannerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    closeButton: {
      padding: 8,
    },
    cameraView: {
      flex: 1,
    },
    errorText: {
      color: theme.colors.error,
      textAlign: 'center',
      padding: 16,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Platform.select({
        ios: theme.dark ? 'rgba(60, 60, 67, 0.18)' : 'rgba(60, 60, 67, 0.29)',
        default: theme.colors.outline,
      }),
      position: 'relative',
    },
    modalCloseButton: {
      position: 'absolute',
      right: 16,
      padding: 4,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: theme.colors.onSurface,
      letterSpacing: -0.4,
    },
    modalContent: {
      paddingTop: 32,
      paddingBottom: 48,
      alignItems: 'center',
      flexGrow: 1,
    },
    instructionText: {
      fontSize: 17,
      textAlign: 'center',
      marginBottom: 12,
      marginHorizontal: 32,
      color: theme.colors.onSurface,
      lineHeight: 24,
    },
    instructionNote: {
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 8,
      marginHorizontal: 32,
      fontStyle: 'italic',
      color: theme.colors.onSurfaceVariant,
      opacity: 0.8,
    },
    qrCodeWrapper: {
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 32,
    },
    qrCodeContainer: {
      padding: 20,
      borderRadius: 20,
      backgroundColor: 'white',
      marginBottom: 20,
      position: 'relative',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
    },
    regenerateIcon: {
      position: 'absolute',
      top: -12,
      right: -12,
      padding: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    qrCodeInstructionText: {
      fontSize: 15,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
      fontWeight: '500',
    },
    buttonSection: {
      width: '100%',
      paddingHorizontal: 32,
    },
    actionButton: {
      backgroundColor: '#007AFF',
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      shadowColor: '#007AFF',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    actionButtonSecondary: {
      backgroundColor: 'transparent',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#3478F6',
      paddingVertical: 14,
      marginBottom: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    actionButtonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: '600',
      marginLeft: 10,
      letterSpacing: 0.3,
    },
    actionButtonTextSecondary: {
      color: '#3478F6',
      fontSize: 17,
      fontWeight: '600',
      marginLeft: 8,
    },
    waitingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
    },
    waitingText: {
      marginLeft: 8,
      fontSize: 16,
      color: theme.colors.onSurface,
    },
    inviteErrorContainer: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    inviteErrorText: {
      color: theme.colors.error,
      fontSize: 16,
      marginBottom: 10,
    },
    retryButton: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    retryButtonText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
  });
  
  // QR Scanner Modal
  const renderQRScanner = () => {
    return (
      <Modal
        visible={isQRScannerVisible}
        animationType="slide"
        onRequestClose={() => setIsQRScannerVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.scannerWrapper}>
            <View style={styles.scannerHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setIsQRScannerVisible(false)}
              >
                <Ionicons name="close" size={28} color={theme.colors.onSurface} />
              </TouchableOpacity>
              <Text style={styles.scannerTitle}>Scan QR Code</Text>
            </View>
            
            <CameraView
              style={styles.cameraView}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            >
              {qrScanError && <RNText style={styles.errorText}>{qrScanError}</RNText>}
            </CameraView>
          </View>
        </SafeAreaView>
      </Modal>
    );
  };
  
  // Person Invitation Modal - using Stack.Screen presentation: 'modal'
  const renderPersonInvitationModal = () => {
    if (!isInvitePersonVisible) return null;
    
    return (
      <Modal
        visible={isInvitePersonVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsInvitePersonVisible(false);
          setInviteQRData(null);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setIsInvitePersonVisible(false);
                setInviteQRData(null);
              }}
            >
              <Text style={{ fontSize: 17, color: theme.colors.primary }}>Done</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {invitationType === 'person' ? 'Invite Person' : 'Add Device'}
            </Text>
          </View>
          
          <ScrollView contentContainerStyle={styles.modalContent} style={{ flex: 1 }}>
            <Text style={styles.instructionText}>
              {invitationType === 'person' 
                ? 'Share this QR code or invitation link with someone to add them to your network.'
                : 'Use this QR code or invitation link to add another device of yours to your network.'
              }
            </Text>
            
            <Text style={styles.instructionNote}>
              Note: Each invitation can only be used once.
            </Text>
            
            {isGeneratingInvite ? (
              <View style={styles.waitingIndicator}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.waitingText}>Generating invitation...</Text>
              </View>
            ) : inviteQRData ? (
              <>
                <View style={styles.qrCodeWrapper}>
                  <View style={styles.qrCodeContainer}>
                    <QRCode
                      value={inviteQRData}
                      size={240}
                      color="black"
                      backgroundColor="white"
                    />
                    <TouchableOpacity 
                      style={styles.regenerateIcon}
                      onPress={invitationType === 'person' ? generatePersonInvitation : generateDeviceInvitation}
                    >
                      <Ionicons name="refresh-outline" size={20} color={theme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.qrCodeInstructionText}>
                    {invitationType === 'person'
                      ? 'Show this to somebody else'
                      : 'Scan this with your other device'
                    }
                  </Text>
                </View>
                
                <View style={styles.buttonSection}>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={copyInvitationData}
                  >
                    <Ionicons name="copy-outline" size={22} color="white" />
                    <Text style={styles.actionButtonText}>Copy Link</Text>
                  </TouchableOpacity>
                </View>
              </>
            
            ) : (
              <View style={styles.inviteErrorContainer}>
                <Text style={styles.inviteErrorText}>Failed to generate invitation code</Text>
                <TouchableOpacity 
                  style={styles.retryButton}
                  onPress={invitationType === 'person' ? generatePersonInvitation : generateDeviceInvitation}
                >
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };
  
  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Connect to Someone Section */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.connections.connectToSomeone', { defaultValue: 'CONNECT TO SOMEONE' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <TextInput
              style={styles.invitationInput}
              placeholder={t('settings.network.connections.pasteInvitation', { defaultValue: 'Paste invitation link here' })}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={invitationLink}
              onChangeText={setInvitationLink}
              editable={!isProcessingInvitation}
              multiline={false}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.invitationButtons}>
              <Button
                mode="contained"
                onPress={() => connectToInvitation(invitationLink)}
                disabled={!invitationLink || isProcessingInvitation}
                loading={isProcessingInvitation}
                style={[themedStyles.buttonPrimary, styles.connectButton]}
                labelStyle={themedStyles.buttonPrimaryText}
              >
                {t('settings.network.connections.connect', { defaultValue: 'Connect' })}
              </Button>
              <Button
                mode="outlined"
                onPress={() => setIsQRScannerVisible(true)}
                disabled={isProcessingInvitation}
                icon="qrcode-scan"
                style={styles.qrScanButton}
              >
                {t('settings.network.connections.scanQR', { defaultValue: 'Scan QR' })}
              </Button>
            </View>
          </View>
        </View>

        {/* My Devices Section */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.connections.myDevices', { defaultValue: 'MY DEVICES' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionSubtitle}>
                {t('settings.network.connections.connectedDevices', { defaultValue: 'Your connected devices' })}
              </Text>
              <Button
                mode="text"
                onPress={handleAddDevicePress}
                icon="plus"
                compact
              >
                {t('settings.network.connections.addDevice', { defaultValue: 'Add Device' })}
              </Button>
            </View>
          
          {iomConnections.length > 0 ? (
            <View>
              {iomConnections.map((conn: any, index: number) => (
                <React.Fragment key={index}>
                  {index > 0 && <View style={themedStyles.settingsDivider} />}
                  <List.Item
                    title={conn.instanceName || `Device ${conn.remoteInstanceId?.slice(0, 8)}...`}
                    description={conn.address || 'Unknown address'}
                    onPress={() => router.push(`/(screens)/device-detail/${conn.id}`)}
                    style={[themedStyles.settingsItem, styles.connectionItem]}
                    titleStyle={styles.connectionName}
                    descriptionStyle={styles.connectionDetails}
                    left={() => (
                      <View style={{ justifyContent: 'center', alignItems: 'center', marginLeft: 16 }}>
                        <View style={[
                          styles.statusDot, 
                          { backgroundColor: conn.isConnected ? theme.colors.primary : theme.colors.error }
                        ]} 
                        />
                      </View>
                    )}
                    right={props => <List.Icon {...props} icon="chevron-right" />}
                  />
                </React.Fragment>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {t('settings.network.connections.noDevices', { defaultValue: 'No devices connected' })}
              </Text>
            </View>
          )}
          </View>
        </View>

        {/* Contacts Section */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.connections.contacts', { defaultValue: 'CONTACTS' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionSubtitle}>
                {t('settings.network.connections.pairedContacts', { defaultValue: 'Your paired contacts' })}
              </Text>
              <Button
                mode="text"
                onPress={handleAddPersonPress}
                icon="plus"
                compact
              >
                {t('settings.network.connections.invitePerson', { defaultValue: 'Invite Person' })}
              </Button>
            </View>
          
          {someoneConnections && someoneConnections.length > 0 ? (
            <View>
              {someoneConnections.map((connection: any, index: number) => (
                <React.Fragment key={index}>
                  {index > 0 && <View style={themedStyles.settingsDivider} />}
                  <List.Item
                    title={connection.someone?.displayName || 'Unknown Contact'}
                    description={
                      connection.summary?.activeConnections > 0 
                        ? `${connection.summary.activeConnections} active connection(s)`
                        : 'Disconnected'
                    }
                    onPress={() => router.push(`/(screens)/contacts/someone/${connection.someone?.someoneId}`)}
                    style={[themedStyles.settingsItem, styles.connectionItem]}
                    titleStyle={styles.connectionName}
                    descriptionStyle={styles.connectionDetails}
                    left={() => (
                      <View style={{ justifyContent: 'center', alignItems: 'center', marginLeft: 16 }}>
                        <View style={[
                          styles.statusDot, 
                          { backgroundColor: connection.summary?.activeConnections > 0 ? theme.colors.primary : theme.colors.error }
                        ]} 
                        />
                      </View>
                    )}
                    right={props => <List.Icon {...props} icon="chevron-right" />}
                  />
                </React.Fragment>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {t('settings.network.connections.noContacts', { defaultValue: 'No contacts connected' })}
              </Text>
            </View>
          )}
          </View>
        </View>
      </ScrollView>
      
      {isQRScannerVisible && renderQRScanner()}
      {isInvitePersonVisible && renderPersonInvitationModal()}
    </SafeAreaView>
  );
}