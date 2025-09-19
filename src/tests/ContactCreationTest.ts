/**
 * ContactCreationTest - Test the fixed contact creation logic
 * 
 * This test verifies that the AppModel now properly creates contacts
 * when receiving pairing requests, fixing the \"connections exist but no contacts\" issue.
 */

import { AppModel } from '../models/AppModel';

export class ContactCreationTest {
    private appModel: AppModel | null = null;

    /**
     * Test the fixed contact creation logic
     */
    public async testContactCreation(): Promise<boolean> {
        console.log('🧪 [ContactCreationTest] Starting contact creation test...');
        
        try {
            // Get the app model instance
            const { getAppModelInstance } = await import('../models/AppModel');
            this.appModel = getAppModelInstance();
            
            if (!this.appModel) {
                console.error('🧪 [ContactCreationTest] ❌ AppModel not available');
                return false;
            }
            
            console.log('🧪 [ContactCreationTest] ✅ AppModel obtained');
            
            // Create a mock pairing request
            const mockPairingRequest = {
                sourcePublicKey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                targetPublicKey: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
                token: 'test-token-12345'
            };
            
            console.log('🧪 [ContactCreationTest] 📞 Simulating pairing request...');
            console.log('🧪 [ContactCreationTest] 📞 Source:', mockPairingRequest.sourcePublicKey.slice(0, 16) + '...');
            
            // Set up a listener for contact creation events
            let contactCreated = false;
            const contactCreatedPromise = new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    console.log('🧪 [ContactCreationTest] ⏰ Contact creation timeout');
                    resolve(false);
                }, 10000); // 10 second timeout
                
                this.appModel!.commServerManager.onContactCreated.listen((contactInfo) => {
                    console.log('🧪 [ContactCreationTest] ✅ Contact created event received:', contactInfo.email);
                    clearTimeout(timeout);
                    contactCreated = true;
                    resolve(true);
                });
            });
            
            // Trigger the pairing request through the CommServer manager
            console.log('🧪 [ContactCreationTest] 📤 Emitting pairing request...');
            this.appModel.commServerManager.onPairingRequest.emit(mockPairingRequest);
            
            // Wait for contact creation or timeout
            const result = await contactCreatedPromise;
            
            if (result) {
                console.log('🧪 [ContactCreationTest] ✅ Contact creation test PASSED');
                return true;
            } else {
                console.log('🧪 [ContactCreationTest] ❌ Contact creation test FAILED - no contact created');
                return false;
            }
            
        } catch (error) {
            console.error('🧪 [ContactCreationTest] ❌ Test failed with error:', error);
            return false;
        }
    }
    
    /**
     * Test contact creation with real CommServer protocol flow
     */
    public async testCommServerProtocolFlow(): Promise<boolean> {
        console.log('🧪 [ContactCreationTest] Starting CommServer protocol flow test...');
        
        try {
            if (!this.appModel) {
                const { getAppModelInstance } = await import('../models/AppModel');
                this.appModel = getAppModelInstance();
            }
            
            if (!this.appModel) {
                console.error('🧪 [ContactCreationTest] ❌ AppModel not available');
                return false;
            }
            
            // Test the full CommServer protocol flow
            const mockConnectionId = 'test-connection-123';
            const mockCommServerMessage = {
                command: 'communication_request',
                sourcePublicKey: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                targetPublicKey: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
            };
            
            console.log('🧪 [ContactCreationTest] 📨 Simulating CommServer message...');
            
            // Set up contact creation listener
            let contactCreated = false;
            const contactCreatedPromise = new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    console.log('🧪 [ContactCreationTest] ⏰ CommServer protocol timeout');
                    resolve(false);
                }, 15000); // 15 second timeout
                
                this.appModel!.commServerManager.onContactCreated.listen((contactInfo) => {
                    console.log('🧪 [ContactCreationTest] ✅ Contact created via CommServer protocol:', contactInfo.email);
                    clearTimeout(timeout);
                    contactCreated = true;
                    resolve(true);
                });
            });
            
            // Send the CommServer message
            await this.appModel.handleCommServerMessage(mockConnectionId, mockCommServerMessage);
            
            // Wait for result
            const result = await contactCreatedPromise;
            
            if (result) {
                console.log('🧪 [ContactCreationTest] ✅ CommServer protocol test PASSED');
                return true;
            } else {
                console.log('🧪 [ContactCreationTest] ❌ CommServer protocol test FAILED');
                return false;
            }
            
        } catch (error) {
            console.error('🧪 [ContactCreationTest] ❌ CommServer protocol test failed:', error);
            return false;
        }
    }
    
    /**
     * Run all contact creation tests
     */
    public async runAllTests(): Promise<{ passed: number; failed: number; results: string[] }> {
        console.log('🧪 [ContactCreationTest] Running all contact creation tests...');
        
        const results: string[] = [];
        let passed = 0;
        let failed = 0;
        
        // Test 1: Direct pairing request
        console.log('\\n🧪 [ContactCreationTest] === Test 1: Direct Pairing Request ===');
        const test1Result = await this.testContactCreation();
        if (test1Result) {
            passed++;
            results.push('✅ Direct Pairing Request: PASSED');
        } else {
            failed++;
            results.push('❌ Direct Pairing Request: FAILED');
        }
        
        // Test 2: CommServer protocol flow
        console.log('\\n🧪 [ContactCreationTest] === Test 2: CommServer Protocol Flow ===');
        const test2Result = await this.testCommServerProtocolFlow();
        if (test2Result) {
            passed++;
            results.push('✅ CommServer Protocol Flow: PASSED');
        } else {
            failed++;
            results.push('❌ CommServer Protocol Flow: FAILED');
        }
        
        console.log('\\n🧪 [ContactCreationTest] === Test Results Summary ===');
        console.log(`🧪 [ContactCreationTest] Passed: ${passed}`);
        console.log(`🧪 [ContactCreationTest] Failed: ${failed}`);
        results.forEach(result => console.log(`🧪 [ContactCreationTest] ${result}`));
        
        return { passed, failed, results };
    }
}

// Export for use in other files
export default ContactCreationTest; 