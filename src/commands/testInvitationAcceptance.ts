/**
 * Test command to accept an invitation URL locally
 * This simulates what edda.one should do when you paste the invitation
 */

import { ModelService } from '../services/ModelService';

export async function testInvitationAcceptance(invitationUrl: string): Promise<void> {
  console.log('[TestInvitationAcceptance] 🧪 Testing invitation acceptance with URL:', invitationUrl);
  
  const appModel = ModelService.getModel();
  if (!appModel) {
    throw new Error('AppModel not available');
  }
  
  if (!appModel.inviteManager) {
    throw new Error('InviteManager not available');
  }
  
  console.log('[TestInvitationAcceptance] 🧪 InviteManager found, attempting to accept invitation...');
  
  try {
    // This should trigger the full pairing protocol:
    // 1. Extract invitation data from URL
    // 2. Call ConnectionsModel.pairing.connectUsingInvitation()
    // 3. Send communication_request
    // 4. Receive communication_ready
    // 5. Complete pairing protocol
    await appModel.inviteManager.acceptInvitationFromUrl(invitationUrl);
    
    console.log('[TestInvitationAcceptance] ✅ Invitation acceptance completed successfully!');
    console.log('[TestInvitationAcceptance] 🔍 Check logs above for pairing protocol messages');
    
  } catch (error) {
    console.error('[TestInvitationAcceptance] ❌ Invitation acceptance failed:', error);
    throw error;
  }
}

// Make it available globally for testing
(global as any).testInvitationAcceptance = testInvitationAcceptance;

console.log('[TestInvitationAcceptance] 🧪 Test function registered globally');
console.log('[TestInvitationAcceptance] 🧪 Usage: testInvitationAcceptance("your_invitation_url_here")'); 