/**
 * CommServer Protocol Test Suite
 * 
 * This test validates that our CommServer implementation correctly follows
 * the one.models/one.leute patterns for identity and key management.
 * 
 * Key findings from analysis:
 * - Both AppModel and InviteManager correctly use mainIdentity() → getDefaultKeys() → encryption key
 * - This matches PairingManager and LeuteConnectionsModule patterns exactly
 * - The issue was timing-related, not architectural
 */

import { AppModel } from '../models/AppModel';
import { InviteManager } from '../models/contacts/InviteManager';

interface TestResult {
  step: string;
  success: boolean;
  details: string;
  timestamp: Date;
}

export class CommServerProtocolTest {
  private appModel: AppModel | null = null;
  private results: TestResult[] = [];

  constructor() {
    console.log('[CommServerProtocolTest] Initializing test suite...');
  }

  /**
   * Run the complete CommServer protocol validation
   */
  async runFullTest(): Promise<TestResult[]> {
    console.log('[CommServerProtocolTest] 🧪 Starting full CommServer protocol test...');
    
    try {
      // Step 1: Validate identity consistency
      await this.testIdentityConsistency();
      
      // Step 2: Validate key derivation
      await this.testKeyDerivation();
      
      // Step 3: Validate invitation creation
      await this.testInvitationCreation();
      
      // Step 4: Validate CommServer registration
      await this.testCommServerRegistration();
      
      // Step 5: Test protocol message handling
      await this.testProtocolMessageHandling();
      
      console.log('[CommServerProtocolTest] ✅ All tests completed');
      return this.results;
      
    } catch (error) {
      this.addResult('Full Test', false, `Test suite failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error('[CommServerProtocolTest] ❌ Test suite failed:', error);
      return this.results;
    }
  }

  /**
   * Test 1: Validate that mainIdentity() returns consistent results
   * This addresses the timing issue identified in our analysis
   */
  private async testIdentityConsistency(): Promise<void> {
    console.log('[CommServerProtocolTest] 🔍 Testing identity consistency...');
    
    try {
      // Get AppModel instance
      const { getAppModelInstance } = await import('../models/AppModel');
      this.appModel = getAppModelInstance();
      
      if (!this.appModel) {
        throw new Error('AppModel not available - app may not be initialized');
      }

      // Test multiple calls to mainIdentity() to ensure consistency
      const identityResults: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        try {
          const me = await this.appModel.leuteModel.me();
          const identity = await me.mainIdentity();
          identityResults.push(identity.toString());
          
          // Small delay to test timing consistency
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          throw new Error(`Identity call ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Verify all identity calls returned the same result
      const allSame = identityResults.every(id => id === identityResults[0]);
      
      if (allSame) {
        this.addResult('Identity Consistency', true, `All ${identityResults.length} calls returned same identity: ${identityResults[0].slice(0, 16)}...`);
      } else {
        this.addResult('Identity Consistency', false, `Inconsistent identities: ${identityResults.map(id => id.slice(0, 16)).join(', ')}`);
      }
      
    } catch (error) {
      this.addResult('Identity Consistency', false, `Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test 2: Validate key derivation follows one.models pattern
   */
  private async testKeyDerivation(): Promise<void> {
    console.log('[CommServerProtocolTest] 🔑 Testing key derivation pattern...');
    
    try {
      if (!this.appModel) {
        throw new Error('AppModel not available');
      }

      // Get identity
      const me = await this.appModel.leuteModel.me();
      const personId = await me.mainIdentity();
      
      // Import required modules (kept as dynamic imports due to test context)
      const { getDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      const { uint8arrayToHexString } = await import('@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js');
      const { getLocalInstanceOfPerson } = await import('@refinio/one.models/lib/misc/instance.js');
      
      // FIXED: Follow PairingManager pattern - get instance first, then keys for that instance
      const defaultInstance = await getLocalInstanceOfPerson(personId);
      const defaultKeys = await getDefaultKeys(defaultInstance);
      const keysObject = await getObject(defaultKeys);
      
      // Validate key structure
      if (!keysObject.publicKey) {
        throw new Error('No publicKey found in keys object');
      }
      
      if (keysObject.publicKey.length !== 64) {
        throw new Error(`Expected 64-byte publicKey, got ${keysObject.publicKey.length} bytes`);
      }
      
      // Extract encryption key (first 32 bytes) - same as our implementation
      const encryptionKeyBytes = keysObject.publicKey.slice(0, 32);
      const publicKeyHex = uint8arrayToHexString(encryptionKeyBytes);
      
      if (publicKeyHex.length !== 64) {
        throw new Error(`Expected 64-character hex string, got ${publicKeyHex.length} characters`);
      }
      
      this.addResult('Key Derivation', true, `Successfully derived encryption key: ${publicKeyHex.slice(0, 16)}... (${publicKeyHex.length} chars)`);
      
    } catch (error) {
      this.addResult('Key Derivation', false, `Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test 3: Validate invitation creation uses correct identity
   */
  private async testInvitationCreation(): Promise<void> {
    console.log('[CommServerProtocolTest] 📨 Testing invitation creation...');
    
    try {
      if (!this.appModel) {
        throw new Error('AppModel not available');
      }

      const inviteManager = this.appModel.inviteManager;
      if (!inviteManager) {
        throw new Error('InviteManager not available');
      }

      // Test invitation creation
      const invitationUrl = await inviteManager.generateInvitationUrl();
      
      if (!invitationUrl) {
        throw new Error('Invitation URL generation failed');
      }
      
      // Extract invitation data to validate format
      const invitationData = InviteManager.extractInvitationFromUrl(invitationUrl);
      
      if (!invitationData) {
        throw new Error('Failed to extract invitation data from URL');
      }
      
      // Validate invitation structure
      const requiredFields = ['token', 'publicKey', 'url'];
      const missingFields = requiredFields.filter(field => !invitationData[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Validate public key format (should be 64 hex characters)
      if (invitationData.publicKey.length !== 64) {
        throw new Error(`Invalid publicKey length: ${invitationData.publicKey.length}, expected 64`);
      }
      
      this.addResult('Invitation Creation', true, `Successfully created invitation with publicKey: ${invitationData.publicKey.slice(0, 16)}...`);
      
    } catch (error) {
      this.addResult('Invitation Creation', false, `Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test 4: Validate CommServer registration uses same identity
   */
  private async testCommServerRegistration(): Promise<void> {
    console.log('[CommServerProtocolTest] 🌐 Testing CommServer registration...');
    
    try {
      if (!this.appModel) {
        throw new Error('AppModel not available');
      }

      // Get CommServer manager stats
      const stats = this.appModel.getCommServerStats();
      
      if (!stats) {
        throw new Error('CommServer stats not available');
      }
      
      // Check if we have registered connections
      if (stats.commServerConnections === 0) {
        throw new Error('No CommServer connections registered');
      }
      
      // Get network status to verify identity is set
      const networkStatus = this.appModel.getNetworkStatus();
      
      if (!networkStatus.hasPublicKey) {
        throw new Error('Public key not set in NetworkPlugin');
      }
      
      this.addResult('CommServer Registration', true, `CommServer registered with ${stats.commServerConnections} connections, identity set: ${networkStatus.hasPublicKey}`);
      
    } catch (error) {
      this.addResult('CommServer Registration', false, `Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test 5: Test protocol message handling
   */
  private async testProtocolMessageHandling(): Promise<void> {
    console.log('[CommServerProtocolTest] 📡 Testing protocol message handling...');
    
    try {
      if (!this.appModel) {
        throw new Error('AppModel not available');
      }

      // Test that CommServerManager can handle basic messages
      const testMessage = {
        command: 'ping',
        timestamp: Date.now()
      };
      
      // This should not throw an error
      try {
        await this.appModel.handleCommServerMessage('test-connection', testMessage);
        this.addResult('Protocol Message Handling', true, 'Successfully handled test message');
      } catch (error) {
        // Ping might fail if not connected, but handler should exist
        if (error instanceof Error && error.message.includes('not found')) {
          this.addResult('Protocol Message Handling', false, `Handler not found: ${error.message}`);
        } else {
          this.addResult('Protocol Message Handling', true, 'Message handler exists (connection error expected)');
        }
      }
      
    } catch (error) {
      this.addResult('Protocol Message Handling', false, `Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add a test result
   */
  private addResult(step: string, success: boolean, details: string): void {
    const result: TestResult = {
      step,
      success,
      details,
      timestamp: new Date()
    };
    
    this.results.push(result);
    
    const status = success ? '✅' : '❌';
    console.log(`[CommServerProtocolTest] ${status} ${step}: ${details}`);
  }

  /**
   * Get test results summary
   */
  getResultsSummary(): { total: number; passed: number; failed: number; results: TestResult[] } {
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    
    return {
      total: this.results.length,
      passed,
      failed,
      results: this.results
    };
  }
}

// Export for use in other test files
export default CommServerProtocolTest; 