/**
 * Connection Lifecycle Debug Script
 * 
 * This script monitors connection lifecycle to detect if spare connections
 * are being closed unexpectedly, which would explain why CommServer
 * can't find them when needed.
 */

console.log('🔄 [CONNECTION_LIFECYCLE] Starting connection lifecycle monitoring...\n');

// Instructions for monitoring connection lifecycle
console.log('📋 [CONNECTION_LIFECYCLE] === MONITORING PROCEDURE ===\n');

console.log('🎯 [CONNECTION_LIFECYCLE] STEP 1: Monitor connection creation');
console.log('   - Watch for "Step 1: Send \'register\' message" logs');
console.log('   - Note the connection IDs being created\n');

console.log('🎯 [CONNECTION_LIFECYCLE] STEP 2: Monitor connection completion');
console.log('   - Watch for "Handover timeout - connection ready as spare" logs');
console.log('   - This means connection is ready to accept requests\n');

console.log('🎯 [CONNECTION_LIFECYCLE] STEP 3: Monitor connection closure');
console.log('   - Watch for "closed:" logs with connection IDs');
console.log('   - If connections close after becoming spare, that\'s the bug!\n');

console.log('🎯 [CONNECTION_LIFECYCLE] STEP 4: Test pairing immediately');
console.log('   - Create invitation immediately after connections become spare');
console.log('   - Try pairing within 30 seconds of connection creation');
console.log('   - This tests if connections are staying alive\n');

console.log('🔍 [CONNECTION_LIFECYCLE] Expected behavior:');
console.log('   ✅ Connection created: "Step 1: Send \'register\' message"');
console.log('   ✅ Connection authenticated: "Step 4: Wait for authentication_success"');
console.log('   ✅ Connection ready: "Handover timeout - connection ready as spare"');
console.log('   ✅ Connection stays open: NO "closed:" messages for that connection');
console.log('   ✅ Pairing works: No "No listening connection" error\n');

console.log('❌ [CONNECTION_LIFECYCLE] Bug indicators:');
console.log('   ❌ Connection closes unexpectedly: "closed: <reason>" after becoming spare');
console.log('   ❌ Ping/pong failures: "ping timeout" or similar messages');
console.log('   ❌ WebSocket errors: "WebSocket error" messages\n');

console.log('🔧 [CONNECTION_LIFECYCLE] If connections are closing:');
console.log('   - Check ping/pong implementation in WebSocket layer');
console.log('   - Verify CommServer is not timing out connections');
console.log('   - Check if lama is properly responding to server pings\n');

console.log('🚀 [CONNECTION_LIFECYCLE] Ready to monitor! Start the app and watch for connection lifecycle events.'); 