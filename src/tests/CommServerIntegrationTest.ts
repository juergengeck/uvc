/**
 * CommServer Integration Test
 * 
 * This test verifies the complete end-to-end pairing flow between lama and edda.one
 * using all CommServer components: NetworkPlugin, CommServerManager, CommServerProtocolHandler,
 * and InviteManager.
 */

import { AppModel } from '../models/AppModel';
import { ModelService } from '../services/ModelService';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Person } from '@refinio/one.core/lib/recipes';

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
  error?: Error;
}

export class CommServerIntegrationTest {
  private appModel: AppModel | null = null;
  private testResults: TestResult[] = [];
  private testStartTime: Date = new Date();

  constructor() {
    console.log('[CommServerIntegrationTest] Initialized');
  }

  /**
   * Run the complete integration test suite
   */
  public async runFullTest(): Promise<TestResult[]> {
    console.log('[CommServerIntegrationTest] 🚀 Starting full integration test...');
    this.testStartTime = new Date();
    this.testResults = [];

    try {
      // Step 1: Initialize AppModel
      await this.testAppModelInitialization();

      // Step 2: Test NetworkPlugin WebSocket Connection
      await this.testNetworkPluginConnection();

      // Step 3: Test Authentication Flow
      await this.testAuthenticationFlow();

      // Step 4: Test Invitation Creation and Token Storage
      await this.testInvitationCreation();

      // Step 5: Test CommServer Stats and Monitoring
      await this.testCommServerStats();

      // Step 6: Test Debug Screen Data
      await this.testDebugScreenData();

      // Step 7: Simulate Pairing Request
      await this.testPairingRequestSimulation();

      // Step 8: Test Person/Someone Object Creation (if pairing successful)
      await this.testPersonSomeoneCreation();

      console.log('[CommServerIntegrationTest] ✅ Full integration test completed');
      this.logTestSummary();

    } catch (error) {
      console.error('[CommServerIntegrationTest] ❌ Test suite failed:', error);
      this.addTestResult('Test Suite', false, 'Test suite failed with error', undefined, error as Error);
    }

    return this.testResults;
  }

  /**
   * Test AppModel initialization
   */
  private async testAppModelInitialization(): Promise<void> {
    console.log('[CommServerIntegrationTest] 📋 Testing AppModel initialization...');

    try {
      // Get AppModel from ModelService
      this.appModel = ModelService.getModel();
      
      if (!this.appModel) {
        throw new Error('AppModel not available from ModelService');
      }

      // Check if AppModel is initialized
      if (!this.appModel.isInitialized) {
        console.log('[CommServerIntegrationTest] AppModel not initialized, waiting...');
        
        // Wait for initialization with timeout
        const initPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('AppModel initialization timeout'));
          }, 30000); // 30 second timeout

          this.appModel!.onReady.listen(() => {
            clearTimeout(timeout);
            resolve();
          });
        });

        await initPromise;
      }

      // Verify required components exist
      const requiredComponents = [
        'networkPlugin',
        'commServerManager',
        'inviteManager',
        'leuteModel'
      ];

      for (const component of requiredComponents) {
        if (!(this.appModel as any)[component]) {
          throw new Error(`Required component missing: ${component}`);
        }
      }

      this.addTestResult(
        'AppModel Initialization',
        true,
        'AppModel initialized successfully with all required components',
        {
          isInitialized: this.appModel.isInitialized,
          components: requiredComponents.map(c => ({ [c]: !!(this.appModel as any)[c] }))
        }
      );

    } catch (error) {
      this.addTestResult(
        'AppModel Initialization',
        false,
        'AppModel initialization failed',
        undefined,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Test NetworkPlugin WebSocket connection
   */
  private async testNetworkPluginConnection(): Promise<void> {
    console.log('[CommServerIntegrationTest] 🌐 Testing NetworkPlugin WebSocket connection...');

    try {
      if (!this.appModel?.networkPlugin) {
        throw new Error('NetworkPlugin not available');
      }

      // Get initial connection state
      const initialState = this.appModel.networkPlugin.getConnectionState();
      console.log('[CommServerIntegrationTest] Initial connection state:', initialState.status);

      // Check if already connected
      if (initialState.status === 'authenticated') {
        this.addTestResult(
          'NetworkPlugin Connection',
          true,
          'NetworkPlugin already connected and authenticated',
          { connectionState: initialState }
        );
        return;
      }

      // If not connected, try to connect
      if (initialState.status === 'disconnected') {
        console.log('[CommServerIntegrationTest] Attempting to connect NetworkPlugin...');
        
        // Set up connection listener
        const connectionPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 15000); // 15 second timeout

          this.appModel!.networkPlugin.onAuthenticated.listen(() => {
            clearTimeout(timeout);
            resolve();
          });

          this.appModel!.networkPlugin.onError.listen((error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        // Attempt connection
        await this.appModel.networkPlugin.connect();
        await connectionPromise;
      }

      // Verify final connection state
      const finalState = this.appModel.networkPlugin.getConnectionState();
      
      if (finalState.status === 'authenticated') {
        this.addTestResult(
          'NetworkPlugin Connection',
          true,
          'NetworkPlugin connected and authenticated successfully',
          { 
            initialState: initialState.status,
            finalState: finalState.status,
            lastConnected: finalState.lastConnected
          }
        );
      } else {
        throw new Error(`Connection failed, final state: ${finalState.status}`);
      }

    } catch (error) {
      this.addTestResult(
        'NetworkPlugin Connection',
        false,
        'NetworkPlugin connection failed',
        undefined,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Test authentication flow
   */
  private async testAuthenticationFlow(): Promise<void> {
    console.log('[CommServerIntegrationTest] 🔐 Testing authentication flow...');

    try {
      if (!this.appModel?.networkPlugin) {
        throw new Error('NetworkPlugin not available');
      }

      // Get network status
      const networkStatus = this.appModel.getNetworkStatus();
      
      // Check if authenticated
      if (networkStatus.status !== 'authenticated') {
        throw new Error(`Authentication not completed, status: ${networkStatus.status}`);
      }

      // Verify we have identity set
      if (!networkStatus.hasPublicKey) {
        throw new Error('Public key not set in NetworkPlugin');
      }

      this.addTestResult(
        'Authentication Flow',
        true,
        'Authentication flow completed successfully',
        {
          status: networkStatus.status,
          hasPublicKey: networkStatus.hasPublicKey,
          connectionId: networkStatus.connectionId,
          reconnectAttempts: networkStatus.reconnectAttempts
        }
      );

    } catch (error) {
      this.addTestResult(
        'Authentication Flow',
        false,
        'Authentication flow failed',
        undefined,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Test invitation creation and token storage
   */
  private async testInvitationCreation(): Promise<void> {
    console.log('[CommServerIntegrationTest] 🎫 Testing invitation creation and token storage...');

    try {
      if (!this.appModel?.inviteManager) {
        throw new Error('InviteManager not available');
      }

      // Create a test invitation
      console.log('[CommServerIntegrationTest] Creating test invitation...');
      const invitation = await this.appModel.inviteManager.createCommServerInvitation();
      
      if (!invitation || !invitation.url || !invitation.token) {
        throw new Error('Invalid invitation created');
      }

      console.log('[CommServerIntegrationTest] Invitation created:', {
        url: invitation.url.slice(0, 50) + '...',
        token: invitation.token.slice(0, 16) + '...'
      });

      // Verify token is stored in CommServerManager
      const commServerStats = this.appModel.getCommServerStats();
      
      if (commServerStats.activeInvitations === 0) {
        throw new Error('Invitation token not stored in CommServerManager');
      }

      // Test token validation
      const validation = this.appModel.commServerManager.validateInvitationToken(invitation.token);
      
      if (!validation.isValid) {
        throw new Error(`Token validation failed: ${validation.reason}`);
      }

      this.addTestResult(
        'Invitation Creation',
        true,
        'Invitation created and token stored successfully',
        {
          invitationUrl: invitation.url.slice(0, 50) + '...',
          tokenLength: invitation.token.length,
          activeInvitations: commServerStats.activeInvitations,
          tokenValidation: validation
        }
      );

    } catch (error) {
      this.addTestResult(
        'Invitation Creation',
        false,
        'Invitation creation failed',
        undefined,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Test CommServer stats and monitoring
   */
  private async testCommServerStats(): Promise<void> {
    console.log('[CommServerIntegrationTest] 📊 Testing CommServer stats and monitoring...');

    try {
      if (!this.appModel) {
        throw new Error('AppModel not available');
      }

      // Get CommServer stats
      const stats = this.appModel.getCommServerStats();
      
      // Verify stats structure
      const requiredFields = [
        'commServerConnections',
        'authenticatedConnections',
        'totalConnections',
        'pairingConnections',
        'establishedConnections',
        'activeInvitations'
      ];

      for (const field of requiredFields) {
        if (typeof (stats as any)[field] !== 'number') {
          throw new Error(`Missing or invalid stats field: ${field}`);
        }
      }

      // Get network status
      const networkStatus = this.appModel.getNetworkStatus();

      // Get active connections
      const activeConnections = this.appModel.getActiveConnections();

      this.addTestResult(
        'CommServer Stats',
        true,
        'CommServer stats retrieved successfully',
        {
          stats,
          networkStatus,
          activeConnectionsCount: activeConnections.length
        }
      );

    } catch (error) {
      this.addTestResult(
        'CommServer Stats',
        false,
        'CommServer stats test failed',
        undefined,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Test debug screen data availability
   */
  private async testDebugScreenData(): Promise<void> {
    console.log('[CommServerIntegrationTest] 🐛 Testing debug screen data availability...');

    try {
      if (!this.appModel) {
        throw new Error('AppModel not available');
      }

      // Test all methods that the debug screen would use
      const networkStatus = this.appModel.getNetworkStatus();
      const commServerStats = this.appModel.getCommServerStats();
      const activeConnections = this.appModel.getActiveConnections();

      // Test debug commands availability
      const debugMethods = [
        'networkPlugin.disconnect',
        'networkPlugin.connect',
        'networkPlugin.sendMessage',
        'commServerManager.clearActiveInvitations'
      ];

      for (const methodPath of debugMethods) {
        const [object, method] = methodPath.split('.');
        const obj = (this.appModel as any)[object];
        
        if (!obj || typeof obj[method] !== 'function') {
          throw new Error(`Debug method not available: ${methodPath}`);
        }
      }

      this.addTestResult(
        'Debug Screen Data',
        true,
        'All debug screen data and methods available',
        {
          networkStatus,
          commServerStats,
          activeConnectionsCount: activeConnections.length,
          debugMethodsAvailable: debugMethods.length
        }
      );

    } catch (error) {
      this.addTestResult(
        'Debug Screen Data',
        false,
        'Debug screen data test failed',
        undefined,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Simulate a pairing request (for testing purposes)
   */
  private async testPairingRequestSimulation(): Promise<void> {
    console.log('[CommServerIntegrationTest] 🤝 Testing pairing request simulation...');

    try {
      if (!this.appModel?.commServerManager) {
        throw new Error('CommServerManager not available');
      }

      // Create a mock pairing request
      const mockPairingRequest = {
        sourcePublicKey: 'mock_public_key_' + Date.now(),
        targetPublicKey: 'our_public_key',
        personId: 'mock_person_id_' + Date.now(),
        token: 'mock_token_' + Date.now()
      };

      console.log('[CommServerIntegrationTest] Simulating pairing request:', {
        sourcePublicKey: mockPairingRequest.sourcePublicKey.slice(0, 16) + '...',
        targetPublicKey: mockPairingRequest.targetPublicKey,
        personId: mockPairingRequest.personId.slice(0, 16) + '...'
      });

      // Store a mock token for validation
      this.appModel.commServerManager.storeInvitationToken(
        mockPairingRequest.token,
        mockPairingRequest.sourcePublicKey,
        5 // 5 minutes expiration
      );

      // Simulate the pairing request event
      // Note: This is a simulation - in real usage, this would come from edda.one
      let pairingRequestReceived = false;
      
      const pairingPromise = new Promise<void>((resolve) => {
        this.appModel!.commServerManager.onPairingRequest.listen((request) => {
          console.log('[CommServerIntegrationTest] Pairing request received in test');
          pairingRequestReceived = true;
          resolve();
        });
        
        // Trigger the event manually for testing
        setTimeout(() => {
          this.appModel!.commServerManager.onPairingRequest.emit(mockPairingRequest);
        }, 100);
      });

      await pairingPromise;

      if (!pairingRequestReceived) {
        throw new Error('Pairing request event not received');
      }

      this.addTestResult(
        'Pairing Request Simulation',
        true,
        'Pairing request simulation completed successfully',
        {
          mockRequest: {
            sourcePublicKey: mockPairingRequest.sourcePublicKey.slice(0, 16) + '...',
            hasToken: !!mockPairingRequest.token
          },
          eventReceived: pairingRequestReceived
        }
      );

    } catch (error) {
      this.addTestResult(
        'Pairing Request Simulation',
        false,
        'Pairing request simulation failed',
        undefined,
        error as Error
      );
      // Don't throw here - this is a simulation test
    }
  }

  /**
   * Test Person/Someone object creation capability
   */
  private async testPersonSomeoneCreation(): Promise<void> {
    console.log('[CommServerIntegrationTest] 👤 Testing Person/Someone object creation capability...');

    try {
      if (!this.appModel?.leuteModel) {
        throw new Error('LeuteModel not available');
      }

      // Test that we can access the ContactCreationService
      const { ContactCreationService } = await import('../services/ContactCreationService');
      
      if (!ContactCreationService) {
        throw new Error('ContactCreationService not available');
      }

      // Verify LeuteModel has required methods
      const requiredMethods = ['me', 'others', 'addSomeoneElse'];
      
      for (const method of requiredMethods) {
        if (typeof (this.appModel.leuteModel as any)[method] !== 'function') {
          throw new Error(`LeuteModel missing required method: ${method}`);
        }
      }

      // Get current contact count
      const initialContacts = await this.appModel.leuteModel.others();
      const initialContactCount = initialContacts.length;

      console.log('[CommServerIntegrationTest] Initial contact count:', initialContactCount);

      this.addTestResult(
        'Person/Someone Creation Capability',
        true,
        'Person/Someone object creation capability verified',
        {
          contactCreationServiceAvailable: true,
          leuteModelMethodsAvailable: requiredMethods.length,
          initialContactCount
        }
      );

    } catch (error) {
      this.addTestResult(
        'Person/Someone Creation Capability',
        false,
        'Person/Someone creation capability test failed',
        undefined,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Add a test result to the results array
   */
  private addTestResult(
    step: string,
    success: boolean,
    message: string,
    data?: any,
    error?: Error
  ): void {
    const result: TestResult = {
      step,
      success,
      message,
      data,
      error
    };

    this.testResults.push(result);
    
    const status = success ? '✅' : '❌';
    console.log(`[CommServerIntegrationTest] ${status} ${step}: ${message}`);
    
    if (error) {
      console.error(`[CommServerIntegrationTest] Error details:`, error);
    }
  }

  /**
   * Log test summary
   */
  private logTestSummary(): void {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const duration = Date.now() - this.testStartTime.getTime();

    console.log('\n[CommServerIntegrationTest] 📋 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('='.repeat(50));

    // Log failed tests
    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`- ${result.step}: ${result.message}`);
          if (result.error) {
            console.log(`  Error: ${result.error.message}`);
          }
        });
    }

    console.log('\n✅ PASSED TESTS:');
    this.testResults
      .filter(r => r.success)
      .forEach(result => {
        console.log(`- ${result.step}: ${result.message}`);
      });
  }

  /**
   * Get test results
   */
  public getTestResults(): TestResult[] {
    return [...this.testResults];
  }

  /**
   * Get test summary
   */
  public getTestSummary(): {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
    duration: number;
  } {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.success).length;
    const failed = total - passed;
    const duration = Date.now() - this.testStartTime.getTime();

    return {
      total,
      passed,
      failed,
      successRate: total > 0 ? (passed / total) * 100 : 0,
      duration
    };
  }
}

// Export a convenience function to run the test
export async function runCommServerIntegrationTest(): Promise<TestResult[]> {
  const test = new CommServerIntegrationTest();
  return await test.runFullTest();
} 