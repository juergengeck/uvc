/**
 * Enhanced Message Signatures Screen with VC Export
 * 
 * This screen displays and exports message signatures as Verifiable Credentials.
 * It integrates with the new VC system to enable:
 * - Viewing existing message signatures
 * - Exporting messages as VCs
 * - Sharing VCs with notaries via group chat
 * - Verifying message integrity
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { 
  Text, 
  List, 
  IconButton, 
  ActivityIndicator, 
  Button,
  Card,
  Chip,
  Menu,
  useTheme,
  Portal,
  Dialog,
  TextInput
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Profile } from '@refinio/one.core/lib/recipes.js';
import type { VCModel, VerifiableCredential } from '@refinio/one.vc';
import type { ChatModel } from '../models/chat/ChatModel';
import { exportAndShareMessageVC, exportAndShareConversationVC } from '../utils/vcExport';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { ensureHash } from '@refinio/one.core/lib/util/type-checks.js';

interface MessageSignaturesScreenProps {
  messageHash: string;
  chatModel: ChatModel;
  vcModel: VCModel;
  onClose: () => void;
}

interface VerifiableCredentialDisplay {
  vc: VerifiableCredential;
  hash: SHA256Hash<VerifiableCredential>;
  isValid: boolean;
  verificationDetails?: {
    issuer: string;
    issuedAt: string;
    claims: Array<{
      type: string;
      value: string;
    }>;
  };
}

export function MessageSignaturesScreen({
  messageHash,
  chatModel,
  vcModel,
  onClose
}: MessageSignaturesScreenProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<ChatMessage | null>(null);
  const [existingVCs, setExistingVCs] = useState<VerifiableCredentialDisplay[]>([]);
  const [exportMenuVisible, setExportMenuVisible] = useState(false);
  const [notaryDialogVisible, setNotaryDialogVisible] = useState(false);
  const [notaryId, setNotaryId] = useState('');
  const [exportingVC, setExportingVC] = useState(false);
  
  useEffect(() => {
    loadMessageAndVCs();
  }, [messageHash]);
  
  const loadMessageAndVCs = async () => {
    try {
      setLoading(true);
      
      // Load the message
      const messageObj = await getObject(ensureHash(messageHash));
      if (!messageObj || messageObj.$type$ !== 'ChatMessage') {
        throw new Error('Invalid message');
      }
      
      const chatMessage = messageObj as ChatMessage;
      setMessage(chatMessage);
      
      // Check for existing VCs in attachments
      const vcDisplays: VerifiableCredentialDisplay[] = [];
      
      if (chatMessage.attachments) {
        for (const attachmentHash of chatMessage.attachments) {
          try {
            const attachment = await getObject(attachmentHash);
            
            // Check if it's a VC
            if (attachment && attachment['@context'] && attachment.type?.includes('VerifiableCredential')) {
              const vc = attachment as VerifiableCredential;
              
              // Basic verification
              const verificationResult = await vcModel.verifyCredential(vc);
              
              vcDisplays.push({
                vc,
                hash: attachmentHash as SHA256Hash<VerifiableCredential>,
                isValid: verificationResult.isValid,
                verificationDetails: {
                  issuer: vc.issuer,
                  issuedAt: vc.issuanceDate,
                  claims: extractClaimsForDisplay(vc)
                }
              });
            }
          } catch (err) {
            console.error('Error loading attachment:', err);
          }
        }
      }
      
      setExistingVCs(vcDisplays);
    } catch (error) {
      console.error('Error loading message:', error);
      Alert.alert('Error', 'Failed to load message data');
    } finally {
      setLoading(false);
    }
  };
  
  const extractClaimsForDisplay = (vc: VerifiableCredential): Array<{ type: string; value: string }> => {
    const claims: Array<{ type: string; value: string }> = [];
    
    if (vc.inlineClaims) {
      for (const claim of vc.inlineClaims) {
        let value = '';
        if (claim.object.type === 'Text') {
          value = claim.object.value;
        } else if (claim.object.type === 'Number') {
          value = claim.object.value.toString();
        } else if (claim.object.type === 'Boolean') {
          value = claim.object.value ? 'Yes' : 'No';
        } else {
          value = `${claim.object.type} value`;
        }
        
        claims.push({
          type: claim.predicate, // Would need to resolve Plan name in real impl
          value
        });
      }
    }
    
    return claims;
  };
  
  const handleExportAsVC = async () => {
    if (!message) return;
    
    try {
      setExportingVC(true);
      
      // Get current topic context
      const topicId = chatModel.currentTopic;
      if (!topicId) {
        throw new Error('No active topic');
      }
      
      // Export the message as a VC
      const messageWithHash = {
        ...message,
        idHash: ensureHash(messageHash) as SHA256Hash<ChatMessage>
      };
      
      const vc = await vcModel.exportChatMessageAsVC(messageWithHash, {
        topicId,
        channelId: topicId,
        pairingId: await getPairingIdForCurrentTopic()
      });
      
      // Store and display
      const vcHash = await vcModel.storeCredential(vc);
      
      Alert.alert(
        'VC Created',
        `Message exported as Verifiable Credential.\n\nVC Hash: ${vcHash.substring(0, 16)}...`,
        [
          { text: 'Copy Hash', onPress: () => copyToClipboard(vcHash) },
          { text: 'Share with Notary', onPress: () => setNotaryDialogVisible(true) },
          { text: 'OK' }
        ]
      );
      
      // Refresh to show new VC
      await loadMessageAndVCs();
    } catch (error) {
      console.error('Error exporting VC:', error);
      Alert.alert('Error', 'Failed to export message as VC');
    } finally {
      setExportingVC(false);
      setExportMenuVisible(false);
    }
  };
  
  const handleShareWithNotary = async () => {
    if (!message || !notaryId) {
      Alert.alert('Error', 'Please enter a notary ID');
      return;
    }
    
    try {
      setExportingVC(true);
      
      const messageWithHash = {
        ...message,
        idHash: ensureHash(messageHash) as SHA256Hash<ChatMessage>
      };
      
      // Export and share in one step
      await exportAndShareMessageVC(
        messageWithHash,
        chatModel,
        vcModel,
        notaryId as SHA256IdHash<Profile>,
        {
          includePairingInfo: true,
          purpose: 'notarization'
        }
      );
      
      Alert.alert(
        'Success',
        'Message VC has been shared with the notary in a group chat.',
        [{ text: 'OK', onPress: () => setNotaryDialogVisible(false) }]
      );
    } catch (error) {
      console.error('Error sharing with notary:', error);
      Alert.alert('Error', 'Failed to share with notary');
    } finally {
      setExportingVC(false);
    }
  };
  
  const getPairingIdForCurrentTopic = async (): Promise<string | undefined> => {
    const topicId = chatModel.currentTopic;
    if (!topicId || !topicId.includes('<->')) return undefined;
    
    const participants = topicId.split('<->');
    const myId = await chatModel.getLeuteModel().myMainIdentity();
    const otherId = participants.find(p => p !== myId);
    
    return otherId ? `pair:${myId}:${otherId}` : undefined;
  };
  
  const copyToClipboard = (text: string) => {
    // Implementation would use Clipboard API
    console.log('Copy to clipboard:', text);
  };
  
  if (loading) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading signatures...</Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.content}>
        {/* Header with actions */}
        <Card style={styles.headerCard}>
          <Card.Title
            title="Message Signatures & VCs"
            subtitle={`Hash: ${messageHash.substring(0, 16)}...`}
            right={(props) => (
              <Menu
                visible={exportMenuVisible}
                onDismiss={() => setExportMenuVisible(false)}
                anchor={
                  <IconButton
                    {...props}
                    icon="export"
                    onPress={() => setExportMenuVisible(true)}
                  />
                }
              >
                <Menu.Item
                  onPress={handleExportAsVC}
                  title="Export as VC"
                  leadingIcon="certificate"
                  disabled={exportingVC}
                />
                <Menu.Item
                  onPress={() => {
                    setExportMenuVisible(false);
                    setNotaryDialogVisible(true);
                  }}
                  title="Share with Notary"
                  leadingIcon="share"
                  disabled={exportingVC}
                />
              </Menu>
            )}
          />
          
          {/* QR Code for easy sharing */}
          <View style={styles.qrContainer}>
            <QRCode
              value={`one://vc/message/${messageHash}`}
              size={120}
              color={theme.colors.onBackground}
              backgroundColor={theme.colors.background}
            />
            <Text style={styles.qrLabel}>Scan to verify message</Text>
          </View>
        </Card>
        
        {/* Existing VCs */}
        {existingVCs.length > 0 && (
          <Card style={styles.vcCard}>
            <Card.Title title="Verifiable Credentials" />
            <Card.Content>
              {existingVCs.map((vcDisplay, index) => (
                <View key={index} style={styles.vcItem}>
                  <View style={styles.vcHeader}>
                    <Chip
                      mode="flat"
                      icon={vcDisplay.isValid ? 'check-circle' : 'alert-circle'}
                      style={[
                        styles.validityChip,
                        { backgroundColor: vcDisplay.isValid ? '#4caf50' : theme.colors.error }
                      ]}
                      textStyle={{ color: 'white' }}
                    >
                      {vcDisplay.isValid ? 'Valid' : 'Invalid'}
                    </Chip>
                    <Text style={styles.vcIssuer}>
                      Issued by: {vcDisplay.verificationDetails?.issuer.substring(0, 8)}...
                    </Text>
                  </View>
                  
                  <Text style={styles.vcDate}>
                    {new Date(vcDisplay.verificationDetails?.issuedAt || '').toLocaleString()}
                  </Text>
                  
                  {vcDisplay.verificationDetails?.claims.map((claim, claimIndex) => (
                    <View key={claimIndex} style={styles.claimRow}>
                      <Text style={styles.claimType}>{claim.type}:</Text>
                      <Text style={styles.claimValue}>{claim.value}</Text>
                    </View>
                  ))}
                  
                  <Button
                    mode="text"
                    onPress={() => {
                      Alert.alert(
                        'VC Details',
                        JSON.stringify(vcDisplay.vc, null, 2),
                        [{ text: 'OK' }]
                      );
                    }}
                    style={styles.detailsButton}
                  >
                    View Full VC
                  </Button>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}
        
        {/* Message preview */}
        {message && (
          <Card style={styles.messageCard}>
            <Card.Title title="Original Message" />
            <Card.Content>
              <Text>{message.text}</Text>
              <Text style={styles.messageMetadata}>
                From: {message.sender.substring(0, 16)}...
              </Text>
              <Text style={styles.messageMetadata}>
                Time: {new Date(message.creationTime || Date.now()).toLocaleString()}
              </Text>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
      
      {/* Notary Dialog */}
      <Portal>
        <Dialog
          visible={notaryDialogVisible}
          onDismiss={() => setNotaryDialogVisible(false)}
        >
          <Dialog.Title>Share with Notary</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              Enter the Profile ID of the notary to share this message VC with:
            </Text>
            <TextInput
              label="Notary Profile ID"
              value={notaryId}
              onChangeText={setNotaryId}
              mode="outlined"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNotaryDialogVisible(false)}>Cancel</Button>
            <Button 
              onPress={handleShareWithNotary}
              loading={exportingVC}
              disabled={!notaryId || exportingVC}
            >
              Share
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  headerCard: {
    margin: 16,
  },
  qrContainer: {
    alignItems: 'center',
    padding: 16,
  },
  qrLabel: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  vcCard: {
    margin: 16,
    marginTop: 0,
  },
  vcItem: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  vcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  validityChip: {
    marginRight: 8,
  },
  vcIssuer: {
    fontSize: 12,
    opacity: 0.7,
  },
  vcDate: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 8,
  },
  claimRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  claimType: {
    fontWeight: 'bold',
    marginRight: 8,
    minWidth: 100,
  },
  claimValue: {
    flex: 1,
  },
  detailsButton: {
    marginTop: 8,
  },
  messageCard: {
    margin: 16,
    marginTop: 0,
  },
  messageMetadata: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  dialogText: {
    marginBottom: 16,
  },
  input: {
    marginTop: 8,
  },
});