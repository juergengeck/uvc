/**
 * Invitation Testing Utility
 * 
 * Helps debug asymmetric pairing by comparing invitation formats
 * and testing URL processing compatibility
 */

import { ModelService } from '../services/ModelService';

export interface InvitationTestResult {
  success: boolean;
  url: string;
  extractedData: any;
  errors: string[];
}

/**
 * Test invitation generation and parsing in lama
 */
export async function testLamaInvitationGeneration(): Promise<InvitationTestResult> {
  const errors: string[] = [];
  
  try {
    console.log('[InvitationTest] 🧪 Testing lama invitation generation...');
    
    const appModel = ModelService.getModel();
    if (!appModel?.inviteManager) {
      errors.push('InviteManager not available');
      return { success: false, url: '', extractedData: null, errors };
    }
    
    // Generate invitation URL
    const url = await appModel.inviteManager.generateInvitationUrl();
    console.log('[InvitationTest] 🧪 Generated URL:', url);
    
    // Test extraction using lama's own extraction logic
    const { InviteManager } = await import('../models/contacts/InviteManager');
    const extractedData = InviteManager.extractInvitationFromUrl(url);
    
    if (!extractedData) {
      errors.push('Failed to extract invitation data from generated URL');
      return { success: false, url, extractedData: null, errors };
    }
    
    console.log('[InvitationTest] 🧪 Extraction successful:', {
      hasToken: !!extractedData.token,
      hasPublicKey: !!extractedData.publicKey,
      hasUrl: !!extractedData.url,
      tokenLength: extractedData.token?.length || 0,
      publicKeyLength: extractedData.publicKey?.length || 0,
      commServerUrl: extractedData.url
    });
    
    return {
      success: true,
      url,
      extractedData,
      errors
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Exception during test: ${errorMsg}`);
    console.error('[InvitationTest] 🧪 Test failed:', error);
    
    return {
      success: false,
      url: '',
      extractedData: null,
      errors
    };
  }
}

/**
 * Test edda.one-style invitation parsing (simulate browser processing)
 */
export function testEddaStyleInvitationParsing(url: string): InvitationTestResult {
  const errors: string[] = [];
  
  try {
    console.log('[InvitationTest] 🧪 Testing edda.one-style parsing for:', url);
    
    // Simulate edda.one's getPairingInformation logic from one.leute/src/utils/pairing.ts
    if (!url.includes('invites/invitePartner/?invited=true')) {
      errors.push('URL does not match edda.one expected format');
      return { success: false, url, extractedData: null, errors };
    }
    
    // Extract hash fragment like edda.one does
    const hashFragment = url.split('#')[1];
    if (!hashFragment) {
      errors.push('No hash fragment found in URL');
      return { success: false, url, extractedData: null, errors };
    }
    
    console.log('[InvitationTest] 🧪 Hash fragment:', hashFragment.substring(0, 50) + '...');
    
    // Parse like edda.one does: decodeURIComponent then JSON.parse
    const decodedData = decodeURIComponent(hashFragment);
    console.log('[InvitationTest] 🧪 Decoded data:', decodedData.substring(0, 50) + '...');
    
    const invitation = JSON.parse(decodedData);
    
    // Validate invitation structure like edda.one does
    if (!invitation.token || !invitation.publicKey || !invitation.url) {
      errors.push('Invalid invitation structure - missing required fields');
      return { success: false, url, extractedData: invitation, errors };
    }
    
    console.log('[InvitationTest] 🧪 Edda-style parsing successful');
    
    return {
      success: true,
      url,
      extractedData: invitation,
      errors
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Edda-style parsing failed: ${errorMsg}`);
    console.error('[InvitationTest] 🧪 Edda-style parsing error:', error);
    
    return {
      success: false,
      url,
      extractedData: null,
      errors
    };
  }
}

/**
 * Run comprehensive invitation compatibility test
 */
export async function runInvitationCompatibilityTest(): Promise<void> {
  console.log('[InvitationTest] 🧪 ========================================');
  console.log('[InvitationTest] 🧪 INVITATION COMPATIBILITY TEST');
  console.log('[InvitationTest] 🧪 ========================================');
  
  // Test 1: Generate invitation with lama
  const lamaTest = await testLamaInvitationGeneration();
  console.log('[InvitationTest] 🧪 Test 1 - Lama Generation:', lamaTest.success ? '✅ PASS' : '❌ FAIL');
  if (lamaTest.errors.length > 0) {
    console.log('[InvitationTest] 🧪   Errors:', lamaTest.errors);
  }
  
  if (lamaTest.success) {
    // Test 2: Parse lama's invitation with edda.one-style logic
    const eddaTest = testEddaStyleInvitationParsing(lamaTest.url);
    console.log('[InvitationTest] 🧪 Test 2 - Edda Parsing:', eddaTest.success ? '✅ PASS' : '❌ FAIL');
    if (eddaTest.errors.length > 0) {
      console.log('[InvitationTest] 🧪   Errors:', eddaTest.errors);
    }
    
    // Compare data consistency
    if (lamaTest.success && eddaTest.success) {
      const dataMatch = 
        lamaTest.extractedData.token === eddaTest.extractedData.token &&
        lamaTest.extractedData.publicKey === eddaTest.extractedData.publicKey &&
        lamaTest.extractedData.url === eddaTest.extractedData.url;
      
      console.log('[InvitationTest] 🧪 Test 3 - Data Consistency:', dataMatch ? '✅ PASS' : '❌ FAIL');
      
      if (!dataMatch) {
        console.log('[InvitationTest] 🧪   Lama data:', lamaTest.extractedData);
        console.log('[InvitationTest] 🧪   Edda data:', eddaTest.extractedData);
      }
    }
  }
  
  console.log('[InvitationTest] 🧪 ========================================');
  console.log('[InvitationTest] 🧪 TEST COMPLETE');
  console.log('[InvitationTest] 🧪 ========================================');
} 