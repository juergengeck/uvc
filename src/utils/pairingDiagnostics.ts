/**
 * Pairing Diagnostics Utility
 * 
 * Helps debug asymmetric pairing issues between lama and browser variants
 */

import { ModelService } from '../services/ModelService';

/**
 * Run comprehensive pairing diagnostics
 */
export async function runPairingDiagnostics(): Promise<void> {
    console.log('[PairingDiagnostics] 🔧 ASYMMETRIC PAIRING DIAGNOSTICS');
    console.log('[PairingDiagnostics] 🔧 =====================================');
    
    try {
        const appModel = ModelService.getModel();
        if (!appModel) {
            console.log('[PairingDiagnostics] ❌ AppModel not available');
            return;
        }
        
        // 1. Check basic infrastructure
        console.log('[PairingDiagnostics] 🔧 1. Infrastructure Check:');
        console.log('  - ConnectionsModel exists:', !!appModel.connections);
        console.log('  - PairingManager exists:', !!appModel.connections?.pairing);
        console.log('  - InviteManager exists:', !!appModel.inviteManager);
        console.log('  - LeuteModel exists:', !!appModel.leuteModel);
        
        // 2. Check connection state
        console.log('[PairingDiagnostics] 🔧 2. Connection State:');
        console.log('  - Online state:', appModel.connections?.onlineState);
        console.log('  - New routes enabled:', appModel.connections?.newRoutesEnabled);
        const connectionsInfo = appModel.connections?.connectionsInfo() || [];
        console.log('  - Total connections:', connectionsInfo.length);
        console.log('  - Catch-all connections:', connectionsInfo.filter((c: any) => c.isCatchAll).length);
        
        // 3. Check active invitations
        console.log('[PairingDiagnostics] 🔧 3. Active Invitations:');
        if (appModel.connections?.pairing) {
            const activeInvitations = (appModel.connections.pairing as any).activeInvitations;
            if (typeof activeInvitations === 'function') {
                console.log('  - Active invitations (function):', activeInvitations().length);
            } else if (activeInvitations && typeof activeInvitations === 'object') {
                console.log('  - Active invitations (object):', Object.keys(activeInvitations).length);
            } else {
                console.log('  - Active invitations:', activeInvitations);
            }
        }
        
        // 4. Test invitation generation
        console.log('[PairingDiagnostics] 🔧 4. Invitation Generation Test:');
        try {
            const testUrl = await appModel.inviteManager.generateInvitationUrl();
            console.log('  - ✅ Invitation generation successful');
            console.log('  - URL length:', testUrl.length);
            console.log('  - Contains edda.one:', testUrl.includes('edda.one') ? '✅' : '❌');
            
            // Test URL parsing
            const { InviteManager } = await import('../models/contacts/InviteManager');
            const extracted = InviteManager.extractInvitationFromUrl(testUrl);
            console.log('  - URL parsing test:', extracted ? '✅ SUCCESS' : '❌ FAILED');
            
            if (extracted) {
                console.log('  - Has token:', !!extracted.token);
                console.log('  - Has publicKey:', !!extracted.publicKey);
                console.log('  - Has url:', !!extracted.url);
            }
            
        } catch (inviteError) {
            console.log('  - ❌ Invitation generation failed:', inviteError instanceof Error ? inviteError.message : String(inviteError));
        }
        
        // 5. Check version information
        console.log('[PairingDiagnostics] 🔧 5. Version Information:');
        try {
            // Note: Using dynamic import for JSON package info
            const packageInfo = await import('@refinio/one.core/package.json');
            console.log('  - one.core version:', packageInfo.version);
        } catch (versionError) {
            console.log('  - one.core version: Cannot detect');
        }
        
        // 6. Generate edda URL (configurable domain)
        console.log('[PairingDiagnostics] 🔧 6. Edda URL Generation:');
        try {
            const eddaUrl = await appModel.inviteManager.generateInvitationUrl();
            console.log('  - ✅ Edda URL generated');
            console.log('  - Contains edda domain:', eddaUrl.includes('edda.one') || eddaUrl.includes('edda.dev.refinio.one') ? '✅' : '❌');
        } catch (eddaError) {
            console.log('  - ❌ Edda URL generation failed:', eddaError instanceof Error ? eddaError.message : String(eddaError));
        }
        
        console.log('[PairingDiagnostics] 🔧 =====================================');
        console.log('[PairingDiagnostics] 🔧 DIAGNOSTICS COMPLETE');
        
    } catch (error) {
        console.error('[PairingDiagnostics] 🔧 Diagnostic error:', error);
    }
}

/**
 * Test invitation URL compatibility with different variants
 */
export async function testInvitationCompatibility(): Promise<void> {
    console.log('[PairingDiagnostics] 🧪 INVITATION COMPATIBILITY TEST');
    
    try {
        const appModel = ModelService.getModel();
        if (!appModel?.inviteManager) {
            console.log('[PairingDiagnostics] ❌ InviteManager not available');
            return;
        }
        
        // Generate test invitation
        const testUrl = await appModel.inviteManager.generateInvitationUrl();
        console.log('[PairingDiagnostics] 🧪 Generated test URL:', testUrl.substring(0, 80) + '...');
        
        // Test parsing
        const { InviteManager } = await import('../models/contacts/InviteManager');
        const extracted = InviteManager.extractInvitationFromUrl(testUrl);
        
        if (extracted) {
            console.log('[PairingDiagnostics] 🧪 ✅ URL parsing successful');
            console.log('  - Token length:', extracted.token?.length || 0);
            console.log('  - PublicKey length:', extracted.publicKey?.length || 0);
            console.log('  - URL:', extracted.url);
            
            // Test re-encoding
            const reEncoded = encodeURIComponent(JSON.stringify(extracted));
            const originalEncoded = testUrl.split('#')[1];
            console.log('  - Re-encoding matches:', reEncoded === originalEncoded ? '✅' : '❌');
            
        } else {
            console.log('[PairingDiagnostics] 🧪 ❌ URL parsing failed');
        }
        
    } catch (error) {
        console.error('[PairingDiagnostics] 🧪 Compatibility test error:', error);
    }
}

/**
 * Log detailed connection information for debugging
 */
export function logConnectionDetails(): void {
    console.log('[PairingDiagnostics] 📊 CONNECTION DETAILS');
    
    try {
        const appModel = ModelService.getModel();
        if (!appModel?.connections) {
            console.log('[PairingDiagnostics] ❌ ConnectionsModel not available');
            return;
        }
        
        const connectionsInfo = appModel.connections.connectionsInfo();
        console.log('[PairingDiagnostics] 📊 Total connections:', connectionsInfo.length);
        
        connectionsInfo.forEach((conn: any, index: number) => {
            console.log(`[PairingDiagnostics] 📊 Connection ${index + 1}:`);
            console.log('  - Protocol:', conn.protocolName);
            console.log('  - Type:', conn.connectionType);
            console.log('  - Connected:', conn.isConnected);
            console.log('  - CatchAll:', conn.isCatchAll);
            console.log('  - Enabled:', conn.enabled);
            console.log('  - State:', conn.state);
            if (conn.routes?.length > 0) {
                conn.routes.forEach((route: any, routeIndex: number) => {
                    console.log(`    Route ${routeIndex + 1}: ${route.name} (active: ${route.active})`);
                });
            }
        });
        
    } catch (error) {
        console.error('[PairingDiagnostics] 📊 Connection details error:', error);
    }
} 

/**
 * Debug the entire ConnectionsModel pipeline when communication_request is received
 */
export function debugConnectionsModelPipeline(): void {
    console.log('[PairingDiagnostics] 🔧 DEBUGGING CONNECTIONSMODEL PIPELINE');
    
    try {
        const appModel = ModelService.getModel();
        if (!appModel?.connections) {
            console.log('[PairingDiagnostics] ❌ ConnectionsModel not available');
            return;
        }
        
        console.log('[PairingDiagnostics] 🔧 ConnectionsModel state:');
        console.log('  - isOnline:', appModel.connections.onlineState);
        console.log('  - allowPairing: true (hardcoded in our config)');
        console.log('  - acceptIncomingConnections: true (hardcoded in our config)');
        console.log('  - acceptUnknownPersons: false (security: only known persons, like one.leute)');
        console.log('  - acceptUnknownInstances: true (hardcoded in our config)');
        
        // Check PairingManager
        console.log('[PairingDiagnostics] 🔧 PairingManager state:');
        const pairingManager = appModel.connections.pairing;
        if (pairingManager) {
            console.log('  - exists: true');
            console.log('  - hasAcceptInvitation:', typeof pairingManager.acceptInvitation === 'function');
            console.log('  - hasConnectUsingInvitation:', typeof pairingManager.connectUsingInvitation === 'function');
        } else {
            console.log('  - exists: false');
        }
        
        // Check LeuteConnectionsModule
        console.log('[PairingDiagnostics] 🔧 LeuteConnectionsModule state:');
        const leuteConnectionsModule = (appModel.connections as any).leuteConnectionsModule;
        if (leuteConnectionsModule) {
            console.log('  - exists: true');
            console.log('  - hasOnUnknownConnection:', typeof leuteConnectionsModule.onUnknownConnection === 'object');
            console.log('  - hasOnKnownConnection:', typeof leuteConnectionsModule.onKnownConnection === 'object');
            
            // 🔍 NEW: Check what LeuteModel is returning
            console.log('[PairingDiagnostics] 🔧 LeuteModel endpoint analysis:');
            const leuteModel = appModel.leuteModel;
            if (leuteModel) {
                // Check IoM endpoints (my devices)
                leuteModel.getInternetOfMeEndpoints().then(iomEndpoints => {
                    console.log('[PairingDiagnostics] 🔧 IoM endpoints (my devices):');
                    console.log('  - count:', iomEndpoints.length);
                    iomEndpoints.forEach((endpoint, index) => {
                        console.log(`    ${index + 1}. PersonID: ${endpoint.personId?.slice(0, 16)}...`);
                        console.log(`       InstanceID: ${endpoint.instanceId?.slice(0, 16)}...`);
                        console.log(`       URL: ${endpoint.url}`);
                    });
                }).catch(err => console.log('[PairingDiagnostics] ❌ Error getting IoM endpoints:', err));
                
                // Check IoP endpoints (other people)
                leuteModel.findAllOneInstanceEndpointsForOthers().then(iopEndpoints => {
                    console.log('[PairingDiagnostics] 🔧 IoP endpoints (other people):');
                    console.log('  - count:', iopEndpoints.length);
                    iopEndpoints.forEach((endpoint, index) => {
                        console.log(`    ${index + 1}. PersonID: ${endpoint.personId?.slice(0, 16)}...`);
                        console.log(`       InstanceID: ${endpoint.instanceId?.slice(0, 16)}...`);
                        console.log(`       URL: ${endpoint.url}`);
                    });
                }).catch(err => console.log('[PairingDiagnostics] ❌ Error getting IoP endpoints:', err));
            }
            
            // Check knownPeerMap contents
            console.log('[PairingDiagnostics] 🔧 knownPeerMap analysis:');
            const knownPeerMap = leuteConnectionsModule.knownPeerMap;
            if (knownPeerMap && typeof knownPeerMap.size === 'number') {
                console.log('  - knownPeerMap size:', knownPeerMap.size);
                if (knownPeerMap.size > 0) {
                    console.log('  - knownPeerMap entries:');
                    let count = 0;
                    for (const [peerId, endpoint] of knownPeerMap) {
                        count++;
                        console.log(`    ${count}. PeerID: ${peerId.slice(0, 16)}...`);
                        console.log(`       PersonID: ${endpoint.personId?.slice(0, 16)}...`);
                        console.log(`       InstanceID: ${endpoint.instanceId?.slice(0, 16)}...`);
                        if (count >= 5) {
                            console.log(`    ... and ${knownPeerMap.size - 5} more entries`);
                            break;
                        }
                    }
                }
            } else {
                console.log('  - knownPeerMap: not accessible or not a Map');
            }
        } else {
            console.log('  - exists: false');
        }
        
        // Check ConnectionRouteManager
        console.log('[PairingDiagnostics] 🔧 ConnectionRouteManager state:');
        const connectionRouteManager = (leuteConnectionsModule as any)?.connectionRouteManager;
        if (connectionRouteManager) {
            console.log('  - exists: true');
        } else {
            console.log('  - exists: false');
        }
        
        // Check CommunicationModule
        console.log('[PairingDiagnostics] 🔧 CommunicationModule state:');
        const communicationModule = (appModel.connections as any).communicationModule;
        if (communicationModule) {
            console.log('  - exists: true');
        } else {
            console.log('  - exists: false');
        }
        
    } catch (error) {
        console.log('[PairingDiagnostics] ❌ Error during diagnostics:', error);
    }
} 