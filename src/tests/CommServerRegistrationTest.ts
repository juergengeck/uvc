/**
 * Simple test to verify CommServer registration and invitation generation
 */

export async function testCommServerRegistration() {
  console.log('🧪 [CommServerRegistrationTest] Starting CommServer registration test...');
  
  try {
    // Get the app model instance
    const { getAppModelInstance } = await import('../models/AppModel.js');
    const appModel = getAppModelInstance();
    
    if (!appModel) {
      throw new Error('AppModel not initialized');
    }
    
    console.log('🧪 [CommServerRegistrationTest] AppModel found');
    
    // Check if CommServerManager is available
    if (!appModel.commServerManager) {
      throw new Error('CommServerManager not available');
    }
    
    console.log('🧪 [CommServerRegistrationTest] CommServerManager available');
    
    // Check if InviteManager is available
    if (!appModel.inviteManager) {
      throw new Error('InviteManager not available');
    }
    
    console.log('🧪 [CommServerRegistrationTest] InviteManager available');
    
    // Test invitation generation
    console.log('🧪 [CommServerRegistrationTest] Attempting to generate invitation...');
    
    try {
      const invitationUrl = await appModel.inviteManager.generateInvitationUrl();
      console.log('🧪 [CommServerRegistrationTest] ✅ Invitation URL generated successfully!');
      console.log('🧪 [CommServerRegistrationTest] Invitation URL:', invitationUrl);
      console.log('🧪 [CommServerRegistrationTest] URL length:', invitationUrl.length);
      console.log('🧪 [CommServerRegistrationTest] Contains edda.one:', invitationUrl.includes('edda.one'));
      
      return {
        success: true,
        invitationUrl,
        message: 'CommServer registration and invitation generation working!'
      };
      
    } catch (inviteError) {
      console.error('🧪 [CommServerRegistrationTest] ❌ Invitation generation failed:', inviteError);
      
      return {
        success: false,
        error: inviteError,
        message: 'Invitation generation failed - likely CommServer registration issue'
      };
    }
    
  } catch (error) {
    console.error('🧪 [CommServerRegistrationTest] ❌ Test setup failed:', error);
    
    return {
      success: false,
      error,
      message: 'Test setup failed'
    };
  }
}

// Auto-run test after a delay to allow app initialization
setTimeout(async () => {
  console.log('🧪 [CommServerRegistrationTest] Auto-running test in 10 seconds...');
  
  setTimeout(async () => {
    const result = await testCommServerRegistration();
    console.log('🧪 [CommServerRegistrationTest] Test result:', result);
  }, 10000); // 10 second delay to allow app to initialize
  
}, 1000); // 1 second delay before scheduling 