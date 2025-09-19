/**
 * Test to simulate edda.one's InvitationInput URL processing
 * This helps debug why lama → edda.one invitations fail
 */

import { ModelService } from '../services/ModelService';

export async function testEddaProcessingLogic(): Promise<void> {
    console.log('[EddaTest] 🔍 TESTING EDDA.ONE INVITATION PROCESSING LOGIC');
    console.log('[EddaTest] 🔍 ================================================');
    
    try {
        const appModel = ModelService.getModel();
        if (!appModel?.inviteManager) {
            console.log('[EddaTest] ❌ AppModel not available');
            return;
        }
        
        // 1. Generate a lama invitation URL
        console.log('[EddaTest] 🔍 1. Generating lama invitation URL...');
        const lamaUrl = await appModel.inviteManager.generateInvitationUrl();
        console.log('[EddaTest] 🔍 Generated URL:', lamaUrl);
        
        // 2. Parse the URL like a browser would
        console.log('[EddaTest] 🔍 2. Parsing URL components...');
        const urlObj = new URL(lamaUrl);
        console.log('[EddaTest] 🔍 URL object:', {
            href: urlObj.href,
            origin: urlObj.origin,
            pathname: urlObj.pathname,
            search: urlObj.search,
            hash: urlObj.hash
        });
        
        // 3. Simulate edda.one's check: location.search.includes('invited=true')
        console.log('[EddaTest] 🔍 3. Simulating edda.one InvitationInput check...');
        const eddaCheck = urlObj.search.includes('invited=true');
        console.log('[EddaTest] 🔍 location.search:', urlObj.search);
        console.log('[EddaTest] 🔍 search.includes("invited=true"):', eddaCheck);
        
        if (eddaCheck) {
            console.log('[EddaTest] ✅ edda.one SHOULD detect this URL');
            
            // 4. Test the invitation extraction
            console.log('[EddaTest] 🔍 4. Testing invitation extraction...');
            const { InviteManager } = await import('../models/contacts/InviteManager');
            const extracted = InviteManager.extractInvitationFromUrl(lamaUrl);
            
            if (extracted) {
                console.log('[EddaTest] ✅ Invitation extraction successful');
                console.log('[EddaTest] 🔍 Extracted invitation:', {
                    hasToken: !!extracted.token,
                    hasPublicKey: !!extracted.publicKey,
                    hasUrl: !!extracted.url,
                    tokenStart: extracted.token?.substring(0, 8) + '...',
                    publicKeyStart: extracted.publicKey?.substring(0, 8) + '...'
                });
            } else {
                console.log('[EddaTest] ❌ Invitation extraction FAILED - this explains the issue');
            }
            
        } else {
            console.log('[EddaTest] ❌ edda.one WILL NOT detect this URL');
            console.log('[EddaTest] 🔍 This explains why lama → edda.one fails');
        }
        
        // 5. Test manual processing as edda.one would
        console.log('[EddaTest] 🔍 5. Testing manual processing...');
        console.log('[EddaTest] 🔍 If user manually pastes URL into edda.one input field...');
        
        // Simulate what happens when user manually enters the URL
        try {
            const { InviteManager } = await import('../models/contacts/InviteManager');
            const manualExtracted = InviteManager.extractInvitationFromUrl(lamaUrl);
            
            if (manualExtracted) {
                console.log('[EddaTest] ✅ Manual processing WOULD work');
                console.log('[EddaTest] 🔍 This confirms the URL format is correct');
                console.log('[EddaTest] 🔍 The issue is in automatic detection, not format');
            } else {
                console.log('[EddaTest] ❌ Manual processing WOULD ALSO fail');
                console.log('[EddaTest] 🔍 This indicates a format compatibility issue');
            }
        } catch (manualError) {
            console.log('[EddaTest] ❌ Manual processing error:', manualError);
        }
        
        // 6. Compare with working edda.one URL
        console.log('[EddaTest] 🔍 6. URL format analysis...');
        console.log('[EddaTest] 🔍 URL breakdown:');
        console.log('[EddaTest] 🔍   - Base: https://edda.one');
        console.log('[EddaTest] 🔍   - Path: /invites/invitePartner/');
        console.log('[EddaTest] 🔍   - Query: ?invited=true');
        console.log('[EddaTest] 🔍   - Hash: #<invitation_data>');
        console.log('[EddaTest] 🔍 Expected edda.one route match: /invites/*');
        console.log('[EddaTest] 🔍 Should route to ConnectionsView with InvitationInput');
        
    } catch (error) {
        console.error('[EddaTest] ❌ Test failed:', error);
    }
} 