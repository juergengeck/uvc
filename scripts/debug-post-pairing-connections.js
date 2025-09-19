#!/usr/bin/env node

/**
 * Debug script to check connection state after pairing completion
 * Run this in the browser console after pairing completes
 */

console.log('🔍 Post-Pairing Connection Diagnostic');

// Check if we have access to the global app model
if (typeof window !== 'undefined' && window.appModel) {
    const appModel = window.appModel;
    console.log('📱 App Model found');
    
    // Check ConnectionsModel state
    if (appModel.connections) {
        console.log('🔗 ConnectionsModel exists');
        
        // Check connection count
        const connectionsInfo = appModel.connections.connectionsInfo();
        console.log('📊 Connections Info:', connectionsInfo);
        
        // Check if pairing system is active
        if (appModel.connections.pairing) {
            console.log('🤝 Pairing system active');
            console.log('📋 Active invitations:', appModel.connections.pairing.activeInvitations?.size || 0);
        } else {
            console.log('❌ No pairing system found');
        }
        
        // Check for persistent connections
        if (appModel.connections.onConnectionOpened) {
            console.log('👂 Connection opened listener exists');
        }
        
        if (appModel.connections.onConnectionClosed) {
            console.log('👂 Connection closed listener exists');
        }
        
        // Check online state
        console.log('🌐 Online state:', appModel.connections.isOnline);
        
    } else {
        console.log('❌ No ConnectionsModel found');
    }
    
    // Check TransportManager state
    if (appModel.transportManager) {
        console.log('🚚 TransportManager exists');
        console.log('📡 Transport status:', appModel.transportManager.status);
    } else {
        console.log('❌ No TransportManager found');
    }
    
} else {
    console.log('❌ No app model found in global scope');
    console.log('💡 Try accessing via developer tools or app-specific global variables');
}

// Instructions for manual debugging
console.log(`
🔧 Manual Debugging Steps:

1. Check if ConnectionsModel has active connections:
   appModel.connections.connectionsInfo()

2. Check if CHUM sync is working:
   appModel.connections.onConnectionOpened.listen((conn) => console.log('Connection opened:', conn))

3. Try sending a test message:
   // This should be handled by the CHUM protocol internally

4. Check contact list:
   appModel.leuteModel.getSomeoneElseList()

5. Check channel manager:
   appModel.channelManager.getChannels()
`); i