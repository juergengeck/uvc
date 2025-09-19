import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Text, Card, List, Divider, useTheme } from 'react-native-paper';
import { useAppModel } from '../../hooks/useAppModel';

/**
 * Test Component for Custom ConnectionsModel Architecture
 * 
 * This component provides UI tests for our custom LamaConnectionsModel implementation
 * that replaces the one.models ConnectionsModel with full transparency and control.
 */
export const ConnectionsModelTestComponent: React.FC = () => {
  const { appModel } = useAppModel();
  const theme = useTheme();
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addTestResult = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestResults(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(`[ConnectionsModelTest] ${message}`);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  /**
   * Test 1: Architecture Integration Test
   * Verifies that our custom architecture is properly connected
   */
  const runArchitectureTest = async () => {
    setIsRunning(true);
    addTestResult('🧪 Starting Architecture Integration Test...');
    
    try {
      // Test AppModel → TransportManager connection
      if (!appModel) {
        addTestResult('❌ AppModel not available');
        return;
      }
      addTestResult('✅ AppModel available');

      // Test TransportManager existence
      const transportManager = (appModel as any).transportManager;
      if (!transportManager) {
        addTestResult('❌ TransportManager not found in AppModel');
        return;
      }
      addTestResult('✅ TransportManager found');

      // Test CommServerManager existence
      const commServerManager = transportManager.commServerManager;
      if (!commServerManager) {
        addTestResult('❌ CommServerManager not found in TransportManager');
        return;
      }
      addTestResult('✅ CommServerManager found');

      // Test LamaConnectionsModel existence
      const connectionsModel = commServerManager.getConnectionsModel();
      if (!connectionsModel) {
        addTestResult('❌ LamaConnectionsModel not found in CommServerManager');
        return;
      }
      addTestResult('✅ LamaConnectionsModel found');

      // Test LamaConnectionsModel type
      const constructorName = connectionsModel.constructor.name;
      if (constructorName === 'LamaConnectionsModel') {
        addTestResult('✅ Custom LamaConnectionsModel detected (not one.models)');
      } else {
        addTestResult(`⚠️ ConnectionsModel type: ${constructorName}`);
      }

      // Test pairing interface
      if (connectionsModel.pairing) {
        addTestResult('✅ Pairing interface available');
        
        if (typeof connectionsModel.pairing.createInvitation === 'function') {
          addTestResult('✅ createInvitation method available');
        } else {
          addTestResult('❌ createInvitation method missing');
        }
        
        if (typeof connectionsModel.pairing.connectUsingInvitation === 'function') {
          addTestResult('✅ connectUsingInvitation method available');
        } else {
          addTestResult('❌ connectUsingInvitation method missing');
        }
      } else {
        addTestResult('❌ Pairing interface not available');
      }

      // Test LeuteAccessRightsManager
      const accessRightsManager = commServerManager.getLeuteAccessRightsManager();
      if (accessRightsManager) {
        addTestResult('✅ LeuteAccessRightsManager found');
      } else {
        addTestResult('❌ LeuteAccessRightsManager not found');
      }

      addTestResult('🎉 Architecture Integration Test Complete!');
      
    } catch (error) {
      addTestResult(`❌ Architecture test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  /**
   * Test 2: Invitation Creation Test
   * Tests our custom invitation creation without network calls
   */
  const runInvitationCreationTest = async () => {
    setIsRunning(true);
    addTestResult('🎫 Starting Invitation Creation Test...');
    
    try {
      if (!appModel) {
        addTestResult('❌ AppModel not available');
        return;
      }

      const transportManager = (appModel as any).transportManager;
      if (!transportManager) {
        addTestResult('❌ TransportManager not available');
        return;
      }

      // Test invitation creation through our custom architecture
      addTestResult('🔄 Creating invitation via TransportManager...');
      
      try {
        const invitation = await transportManager.createInvitation();
        
        if (invitation && invitation.token && invitation.publicKey && invitation.url) {
          addTestResult('✅ Invitation created successfully');
          addTestResult(`🔑 Token: ${invitation.token.substring(0, 16)}...`);
          addTestResult(`🔐 Public Key: ${invitation.publicKey.substring(0, 16)}...`);
          addTestResult(`🌐 URL: ${invitation.url}`);
          
          // Verify invitation structure
          if (invitation.token.length > 20) {
            addTestResult('✅ Token length valid');
          } else {
            addTestResult('⚠️ Token seems short');
          }
          
          if (invitation.publicKey.length === 64) {
            addTestResult('✅ Public key length valid (64 chars)');
          } else {
            addTestResult(`⚠️ Public key length: ${invitation.publicKey.length}`);
          }
          
        } else {
          addTestResult('❌ Invitation missing required fields');
        }
        
              } catch (inviteError) {
          addTestResult(`❌ Invitation creation failed: ${inviteError instanceof Error ? inviteError.message : String(inviteError)}`);
        }

        addTestResult('🎉 Invitation Creation Test Complete!');
        
      } catch (error) {
        addTestResult(`❌ Invitation test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  /**
   * Test 3: Connection State Test
   * Tests connection state monitoring and events
   */
  const runConnectionStateTest = async () => {
    setIsRunning(true);
    addTestResult('📡 Starting Connection State Test...');
    
    try {
      if (!appModel) {
        addTestResult('❌ AppModel not available');
        return;
      }

      const transportManager = (appModel as any).transportManager;
      const commServerManager = transportManager?.commServerManager;
      const connectionsModel = commServerManager?.getConnectionsModel();
      
      if (!connectionsModel) {
        addTestResult('❌ ConnectionsModel not available');
        return;
      }

      // Test online state
      const isOnline = connectionsModel.onlineState;
      addTestResult(`📊 Current online state: ${isOnline}`);
      
      // Test event listeners
      if (connectionsModel.onOnlineStateChange) {
        addTestResult('✅ onOnlineStateChange event available');
      } else {
        addTestResult('❌ onOnlineStateChange event missing');
      }
      
      if (connectionsModel.onPairingSuccess) {
        addTestResult('✅ onPairingSuccess event available');
      } else {
        addTestResult('❌ onPairingSuccess event missing');
      }
      
      if (connectionsModel.onConnectionsChange) {
        addTestResult('✅ onConnectionsChange event available');
      } else {
        addTestResult('❌ onConnectionsChange event missing');
      }

      // Test configuration
      const config = connectionsModel.config;
      if (config) {
        addTestResult('✅ Configuration available');
        addTestResult(`🌐 CommServer URL: ${config.commServerUrl}`);
        addTestResult(`🔐 Allow Pairing: ${config.allowPairing}`);
        addTestResult(`📥 Accept Incoming: ${config.acceptIncomingConnections}`);
        addTestResult(`📤 Establish Outgoing: ${config.establishOutgoingConnections}`);
      } else {
        addTestResult('❌ Configuration not available');
      }

      addTestResult('🎉 Connection State Test Complete!');
      
    } catch (error) {
      addTestResult(`❌ Connection state test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRunning(false);
    }
  };

  /**
   * Test 4: Public Key Consistency Test
   * Verifies that the same public key is used throughout the system
   */
  const runPublicKeyConsistencyTest = async () => {
    setIsRunning(true);
    addTestResult('🔑 Starting Public Key Consistency Test...');
    
    try {
      if (!appModel) {
        addTestResult('❌ AppModel not available');
        return;
      }

      // Test 1: Get public key from invitation creation
      const transportManager = (appModel as any).transportManager;
      if (!transportManager) {
        addTestResult('❌ TransportManager not available');
        return;
      }

      let invitationPublicKey: string | null = null;
      try {
        const invitation = await transportManager.createInvitation();
        invitationPublicKey = invitation.publicKey;
        addTestResult(`🎫 Invitation public key: ${invitationPublicKey?.substring(0, 16)}...`);
      } catch (error) {
        addTestResult(`❌ Failed to get invitation public key: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // Test 2: Get public key from LeuteModel directly
      const leuteModel = (appModel as any).leuteModel;
      if (leuteModel && invitationPublicKey) {
        try {
          const personId = await leuteModel.myMainIdentity();
          addTestResult(`👤 Person ID: ${personId.substring(0, 16)}...`);
          
          // Import getDefaultKeys to check the actual key
          const { getDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
          const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
          
          // REVERTED: Use one.leute pattern - keys directly from Person ID (not Instance ID)
          console.log('🔑 [KEY_DEBUG] ConnectionsModelTestComponent - PersonId:', personId);
          
          const keysHash = await getDefaultKeys(personId);
          console.log('🔑 [KEY_DEBUG] ConnectionsModelTestComponent - KeysHash:', keysHash);
          const keys = await getObject(keysHash);
          const directPublicKey = keys.publicKey;
          console.log('🔑 [KEY_DEBUG] ConnectionsModelTestComponent - PublicKey:', directPublicKey);
          
          addTestResult(`🔐 Direct public key: ${directPublicKey.substring(0, 16)}...`);
          
          // Compare keys
          if (invitationPublicKey === directPublicKey) {
            addTestResult('✅ PUBLIC KEY CONSISTENCY: Keys match perfectly!');
          } else {
            addTestResult('❌ PUBLIC KEY MISMATCH: Different keys detected!');
            addTestResult(`   Invitation: ${invitationPublicKey}`);
            addTestResult(`   Direct:     ${directPublicKey}`);
          }
          
        } catch (error) {
          addTestResult(`❌ Failed to get direct public key: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        addTestResult('❌ LeuteModel not available or invitation key missing');
      }

      addTestResult('🎉 Public Key Consistency Test Complete!');
      
    } catch (error) {
      addTestResult(`❌ Public key test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRunning(false);
    }
  };



  return (
    <Card style={styles.container}>
      <Card.Title 
        title="Custom ConnectionsModel Architecture Tests"
        subtitle="Test our LamaConnectionsModel that replaces one.models with full control"
      />
      <Card.Content>
        
        {/* Test Buttons */}
        <View style={styles.buttonContainer}>
          <Button 
            mode="contained" 
            onPress={runArchitectureTest}
            disabled={isRunning}
            style={styles.button}
            icon="cog-outline"
          >
            Architecture Test
          </Button>
          
          <Button 
            mode="contained" 
            onPress={runInvitationCreationTest}
            disabled={isRunning}
            style={styles.button}
            icon="ticket-outline"
          >
            Invitation Test
          </Button>
          
          <Button 
            mode="contained" 
            onPress={runConnectionStateTest}
            disabled={isRunning}
            style={styles.button}
            icon="wifi-check"
          >
            Connection State Test
          </Button>
          
          <Button 
            mode="contained" 
            onPress={runPublicKeyConsistencyTest}
            disabled={isRunning}
            style={styles.button}
            icon="key-variant"
          >
            Public Key Test
          </Button>
        </View>



        <Divider style={styles.divider} />

        {/* Control Buttons */}
        <View style={styles.controlContainer}>
          <Button 
            mode="outlined" 
            onPress={clearResults}
            disabled={isRunning}
            style={styles.controlButton}
            icon="delete-outline"
          >
            Clear Results
          </Button>
        </View>

        {/* Test Results */}
        {testResults.length > 0 && (
          <>
            <Divider style={styles.divider} />
            <Text variant="titleMedium" style={styles.resultsTitle}>
              Test Results ({testResults.length})
            </Text>
            <ScrollView style={styles.resultsContainer}>
              {testResults.map((result, index) => (
                <Text key={index} style={styles.resultText}>
                  {result}
                </Text>
              ))}
            </ScrollView>
          </>
        )}

        {/* Architecture Summary */}
        <Divider style={styles.divider} />
        <Text variant="titleMedium" style={styles.summaryTitle}>
          Architecture Overview
        </Text>
        <List.Section>
          <List.Item
            title="TransportManager"
            description="Central coordinator for all transport types"
            left={props => <List.Icon {...props} icon="hub-outline" />}
          />
          <List.Item
            title="CommServerManager"
            description="Manages LamaConnectionsModel and access rights"
            left={props => <List.Icon {...props} icon="server-network-outline" />}
          />
          <List.Item
            title="LamaConnectionsModel"
            description="Custom implementation replacing one.models"
            left={props => <List.Icon {...props} icon="connection" />}
          />
          <List.Item
            title="LeuteAccessRightsManager"
            description="Handles pairing and access control"
            left={props => <List.Icon {...props} icon="shield-account-outline" />}
          />
        </List.Section>

      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  button: {
    flex: 1,
    minWidth: 120,
  },
  controlContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  controlButton: {
    minWidth: 120,
  },
  divider: {
    marginVertical: 16,
  },
  resultsTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  resultsContainer: {
    maxHeight: 300,
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resultText: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
  summaryTitle: {
    marginBottom: 8,
    fontWeight: 'bold',
  },

}); 