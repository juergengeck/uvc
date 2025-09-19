import React from 'react';
import { View, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTheme, Text, List, IconButton, ActivityIndicator, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import { getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { ensureIdHash, ensureHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { VersionedObjectResult } from '@refinio/one.core/lib/storage-versioned-objects.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import QRCode from 'react-native-qrcode-svg';
import { reconstructVerifiableCredential, verifyMessageSignature } from '@src/utils/messageUtils';

/**
 * Message Signatures Screen
 * 
 * This screen displays certificate information for message authentication.
 * 
 * For more information about the certificate system, see the certs.md file
 * in the project root directory, which documents:
 * - Certificate types and their purposes
 * - How certificates are created and attached to messages
 * - The verification process for certificates
 * - How to use the TrustedKeysManager for advanced certificate operations
 */

interface MessageSignature {
  signer: string;
  timestamp: Date;
  certificate: string;
  certificateType?: string;
  certificateData?: any;
  isValid?: boolean;
}

export default function SignaturesScreen() {
  const params = useLocalSearchParams();
  const messageHash = Array.isArray(params.hash) ? params.hash[0] : params.hash;
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation(Namespaces.MESSAGES);
  const [signatures, setSignatures] = React.useState<MessageSignature[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [errorDetails, setErrorDetails] = React.useState<string | null>(null);
  const instance = useInstance();
  // Flag to prevent repeated loading attempts
  const hasAttemptedLoad = React.useRef(false);

  // Generate the route for the QR code
  const route = `/(screens)/messages/signatures/${messageHash}`;

  const showCertificateHelp = () => {
    Alert.alert(
      "Message Verifiable Credentials",
      "Messages have verifiable credentials that prove authenticity using Ed25519 signatures.\n\n" +
      "Each signature contains:\n" +
      "• Cryptographic proof of the sender's identity\n" +
      "• Link to previous message (creating a chain)\n" +
      "• Timestamp and context information\n\n" +
      "Signatures are stored as separate objects and can be reconstructed into full W3C Verifiable Credentials.\n\n" +
      "For technical details, see messages.md in the project documentation.",
      [
        { text: "OK" }
      ]
    );
  };

  React.useEffect(() => {
    // Prevent repeated loading attempts
    if (hasAttemptedLoad.current) {
      return;
    }
    
    hasAttemptedLoad.current = true;
    
    const loadSignatures = async () => {
      if (!messageHash) {
        setError(t('signatures.invalidHash'));
        setLoading(false);
        return;
      }

      try {
        console.log(`[SignaturesScreen] Loading signatures for message: ${messageHash}`);
        
        // Direct access to message by content hash
        let message: InstanceType<typeof ChatMessage> | null = null;
        try {
          console.log(`[SignaturesScreen] Loading message by content hash: ${messageHash}`);
          const messageObj = await getObject(ensureHash(messageHash));
          
          if (!messageObj) {
            throw new Error('Message not found');
          }
          
          if (messageObj.$type$ !== 'ChatMessage') {
            throw new Error(`Invalid object type: ${messageObj.$type$ || 'unknown'}`);
          } else {
            message = messageObj as InstanceType<typeof ChatMessage>;
          }
        } catch (err) {
          // Check for FileNotFoundError
          if (err && err.toString().includes('FileNotFoundError')) {
            console.log('[SignaturesScreen] Message not found in storage');
            throw new Error('Message not found in storage. It may have been deleted or the hash is invalid.');
          }
          // Check for the M2O-PH1 error which indicates HTML parsing issues
          else if (err && err.toString().includes('M2O-PH1') && err.toString().includes('itemscope')) {
            console.log('[SignaturesScreen] Got HTML parsing error, using alternate approach');
            
            // Try to extract hash directly from error message if it contains valid hashes
            const errorMsg = err.toString();
            const hashMatches = errorMsg.match(/[a-f0-9]{64}/g);
            
            if (hashMatches && hashMatches.length > 0) {
              console.log(`[SignaturesScreen] Found potential hashes in error: ${hashMatches.length}`);
              // Use these hashes as signature references directly
              const messageSignatures: MessageSignature[] = [];
              
              // Only use unique hashes to avoid duplicates
              const uniqueHashes = [...new Set(hashMatches)];
              
              // Create a signature object for each hash
              for (const hash of uniqueHashes) {
                // Avoid using the message hash itself as a signature reference
                if (hash !== messageHash.toString()) {
                  messageSignatures.push({
                    signer: 'Reference ID',
                    timestamp: new Date(),
                    certificate: hash
                  });
                }
              }
              
              console.log(`[SignaturesScreen] Created ${messageSignatures.length} signature references`);
              setSignatures(messageSignatures);
              setLoading(false);
              return;
            } else {
              throw new Error('HTML format received and no valid hashes found');
            }
          } else {
            console.error('[SignaturesScreen] Error in direct object access:', err);
            throw err;
          }
        }
        
        if (!message) {
          throw new Error('Could not load message data');
        }
        
        // TypeScript assertion: we know message is not null after the check above
        const typedMessage = message as InstanceType<typeof ChatMessage>;
        
        console.log(`[SignaturesScreen] Message loaded: ${typedMessage.$type$}, attachments: ${typedMessage.attachments?.length || 0}`);
        
        // Get signatures from attachments
        const signatureHashes = (typedMessage.attachments || []) as SHA256Hash[];
        const messageSignatures: MessageSignature[] = [];
        
        if (signatureHashes.length === 0) {
          console.log(`[SignaturesScreen] No attachments/signatures found`);
          setSignatures([]);
          setLoading(false);
          return;
        }
        
        // Load each signature object
        for (const hash of signatureHashes) {
          try {
            const hashString = hash.toString();
            console.log(`[SignaturesScreen] Loading signature: ${hashString}`);
            
            // Load the signature object
            const signatureObj = await getObject(ensureHash(hashString));
            
            if (!signatureObj) {
              console.warn(`[SignaturesScreen] Signature object not found: ${hashString}`);
              continue;
            }
            
            if (signatureObj.$type$ === 'MessageSignature') {
              console.log(`[SignaturesScreen] Real MessageSignature loaded successfully`);
              
              // Verify the signature
              const verificationResult = await verifyMessageSignature(messageHash, typedMessage, hashString);
              
              // Try to reconstruct VC if it's a real signature
              const vc = await reconstructVerifiableCredential(messageHash, typedMessage, hashString);
              
              // Get display type
              let displayCertType = 'Unknown';
              if (signatureObj.signatureType === 'system') displayCertType = 'System';
              else if (signatureObj.signatureType === 'user') displayCertType = 'User';
              else if (signatureObj.signatureType === 'ai') displayCertType = 'AI';
              
              messageSignatures.push({
                signer: vc ? vc.issuer : typedMessage.sender.toString(),
                timestamp: new Date(signatureObj.timestamp || Date.now()),
                certificate: hashString,
                certificateType: displayCertType,
                certificateData: vc || signatureObj,
                isValid: verificationResult.isValid
              });
            } else {
              console.warn(`[SignaturesScreen] Unknown signature type: ${signatureObj.$type$}`);
            }
          } catch (err) {
            console.error(`[SignaturesScreen] Error loading signature ${hash.toString()}:`, err);
          }
        }
        
        console.log(`[SignaturesScreen] Loaded ${messageSignatures.length} signatures`);
        setSignatures(messageSignatures);
        setLoading(false);
        
      } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[SignaturesScreen] Error loading signatures:', err);
        setError(t('signatures.loadError'));
        setErrorDetails(`Error: ${errorMsg}`);
        setLoading(false);
      }
    };

    loadSignatures();
  }, [messageHash, t, instance]);

  const handleShowErrorDetails = () => {
    if (errorDetails) {
      Alert.alert('Error Details', errorDetails);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: t('signatures.title'),
          headerRight: () => (
            <IconButton
              icon="help-circle"
              onPress={showCertificateHelp}
            />
          ),
        }}
      />

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('signatures.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
          {errorDetails && (
            <IconButton
              icon="information"
              size={24}
              onPress={handleShowErrorDetails}
              style={styles.infoButton}
            />
          )}
        </View>
      ) : signatures.length === 0 ? (
        <View style={styles.centerContent}>
          <Text>{t('signatures.noSignatures')}</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Message certificates verify the authenticity of messages in the system.
              See our documentation for more details.
            </Text>
          </View>

          <View style={styles.qrContainer}>
            <QRCode
              value={route}
              size={150}
              color={theme.colors.onBackground}
              backgroundColor={theme.colors.background}
            />
            <Text style={[styles.routeText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2} ellipsizeMode="middle">
              {messageHash}
            </Text>
          </View>
          <List.Section>
            <List.Subheader style={styles.listSubheader}>Certificate Details</List.Subheader>
            {signatures.map((signature, index) => (
              <View key={index} style={styles.certificateListItem}>
                <List.Item
                  title={
                    <View style={styles.titleContainer}>
                      <Text style={styles.signerTitle}>{signature.signer}</Text>
                      {signature.certificateType && (
                        <View style={[styles.certTypeBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                          <Text style={[styles.certTypeText, { color: theme.colors.onPrimaryContainer }]}>
                            {signature.certificateType}
                          </Text>
                        </View>
                      )}
                      {signature.isValid !== undefined && (
                        <View style={[
                          styles.validityBadge, 
                          { backgroundColor: signature.isValid ? '#4caf50' : theme.colors.error }
                        ]}>
                          <Text style={[styles.validityText, { color: 'white' }]}>
                            {signature.isValid ? 'Valid' : 'Invalid'}
                          </Text>
                        </View>
                      )}
                    </View>
                  }
                  description={() => (
                    <View style={styles.certificateContainer}>
                      <Text style={styles.certificateText} numberOfLines={2} ellipsizeMode="middle">
                        {signature.certificate}
                      </Text>
                      <Text style={styles.timestampText}>
                        • {signature.timestamp.toLocaleString()}
                      </Text>
                      {signature.certificateData && (
                        <Text style={styles.certificateDataText} numberOfLines={1} ellipsizeMode="tail">
                          With verification data
                        </Text>
                      )}
                    </View>
                  )}
                  left={props => (
                    <List.Icon 
                      {...props} 
                      icon={signature.certificateType ? "certificate-outline" : "certificate"} 
                      color={signature.isValid === true ? '#4caf50' : 
                             signature.isValid === false ? theme.colors.error :
                             theme.colors.primary} 
                    />
                  )}
                  onPress={() => {
                    let detailsText = `Type: ${signature.certificateType || signature.signer}\nCertificate ID: ${signature.certificate}\nTimestamp: ${signature.timestamp.toLocaleString()}`;
                    
                    // Add VC details if available
                    if (signature.certificateData && signature.certificateData['@context']) {
                      detailsText += '\n\nVerifiable Credential:';
                      detailsText += `\nIssuer: ${signature.certificateData.issuer}`;
                      if (signature.certificateData.credentialSubject?.inReplyTo) {
                        detailsText += `\nIn Reply To: ${signature.certificateData.credentialSubject.inReplyTo.substring(0, 16)}...`;
                      }
                      detailsText += `\nProof Type: ${signature.certificateData.proof?.type || 'Ed25519Signature2020'}`;
                    }
                    
                    if (signature.isValid !== undefined) {
                      detailsText += `\n\nStatus: ${signature.isValid ? '✓ Valid' : '✗ Invalid'}`;
                    }
                    
                    Alert.alert(
                      signature.certificateData && signature.certificateData['@context'] ? 
                        "Verifiable Credential Details" : "Certificate Details", 
                      detailsText,
                      [
                        { text: "Close" },
                        { 
                          text: "Learn More", 
                          onPress: showCertificateHelp 
                        }
                      ]
                    );
                  }}
                  style={styles.listItem}
                />
              </View>
            ))}
          </List.Section>
        </ScrollView>
      )}
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
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    paddingTop: 32,
    marginTop: 8,
    marginBottom: 16,
  },
  routeText: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  infoButton: {
    marginTop: 8,
  },
  infoCard: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  certificateContainer: {
    flexDirection: 'column',
    flex: 1,
    marginTop: 4,
  },
  certificateText: {
    fontSize: 13,
    flexShrink: 1,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  timestampText: {
    fontSize: 12,
    opacity: 0.8,
  },
  listSubheader: {
    fontSize: 16,
    fontWeight: '600',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  signerTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginRight: 8,
  },
  certTypeBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  certTypeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  validityBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  validityText: {
    fontSize: 10,
    fontWeight: '500',
  },
  certificateDataText: {
    fontSize: 11,
    fontStyle: 'italic',
    opacity: 0.7,
    marginTop: 2,
  },
  certificateListItem: {
    marginVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  listItem: {
    paddingVertical: 8,
  }
}); 