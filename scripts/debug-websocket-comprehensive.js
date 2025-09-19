#!/usr/bin/env node

/**
 * Comprehensive WebSocket Debug Script
 * 
 * This script helps identify WebSocket connection issues between:
 * - Lama mobile app
 * - Communication server (comm10.dev.refinio.one)
 * - one.leute web application
 * 
 * Run this to get detailed WebSocket behavior analysis
 */

const WebSocket = require('ws');

console.log('🔍 Comprehensive WebSocket Connection Analysis');
console.log('===============================================\n');

const COMM_SERVER = 'wss://comm10.dev.refinio.one';
const TIMEOUT = 45000; // 45 seconds to allow for handshake

let testResults = {
  basicConnectivity: null,
  handshakeAnalysis: null,
  messageFlow: null,
  errorPatterns: []
};

// Test 1: Basic Connectivity
async function testBasicConnectivity() {
  console.log('📡 Test 1: Basic WebSocket Connectivity');
  console.log('---------------------------------------');
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const ws = new WebSocket(COMM_SERVER);
    
    let result = {
      success: false,
      connectionTime: null,
      error: null,
      closeInfo: null
    };
    
    const timeout = setTimeout(() => {
      result.error = 'Connection timeout (45s)';
      console.log('❌ Connection timeout after 45 seconds');
      try { ws.close(); } catch (e) {}
      resolve(result);
    }, TIMEOUT);
    
    ws.on('open', () => {
      result.success = true;
      result.connectionTime = Date.now() - startTime;
      console.log(`✅ Connection established in ${result.connectionTime}ms`);
      
      // Keep connection open briefly to test stability
      setTimeout(() => {
        ws.close(1000, 'Test complete');
      }, 2000);
    });
    
    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      result.closeInfo = { 
        code, 
        reason: reason.toString(),
        clean: code === 1000 
      };
      console.log(`🔚 Connection closed: Code ${code}, Reason: "${reason}"`);
      resolve(result);
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      result.error = error.message;
      console.log(`❌ Connection error: ${error.message}`);
      resolve(result);
    });
    
    ws.on('message', (data) => {
      console.log(`📥 Received message: ${data.toString().substring(0, 100)}...`);
    });
  });
}

// Test 2: Handshake Analysis
async function testHandshakePattern() {
  console.log('\n🤝 Test 2: Connection Handshake Analysis');
  console.log('----------------------------------------');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(COMM_SERVER);
    
    let result = {
      phases: [],
      totalTime: null,
      success: false,
      error: null
    };
    
    const startTime = Date.now();
    let phase = 'connecting';
    
    const logPhase = (newPhase, data = {}) => {
      const now = Date.now();
      result.phases.push({
        phase: newPhase,
        timestamp: now - startTime,
        data
      });
      phase = newPhase;
      console.log(`📍 Phase: ${newPhase} at +${now - startTime}ms`, data);
    };
    
    const timeout = setTimeout(() => {
      logPhase('timeout');
      result.error = 'Handshake timeout';
      try { ws.close(); } catch (e) {}
      resolve(result);
    }, TIMEOUT);
    
    logPhase('initial');
    
    ws.on('open', () => {
      logPhase('websocket_open');
      
      // Try sending a simple message to see protocol response
      try {
        const testMessage = JSON.stringify({
          type: 'test',
          timestamp: Date.now()
        });
        ws.send(testMessage);
        logPhase('test_message_sent', { message: testMessage });
      } catch (error) {
        logPhase('send_error', { error: error.message });
      }
      
      // Wait for potential protocol messages
      setTimeout(() => {
        result.success = true;
        result.totalTime = Date.now() - startTime;
        ws.close(1000, 'Handshake analysis complete');
      }, 5000);
    });
    
    ws.on('message', (data) => {
      logPhase('message_received', { 
        type: typeof data,
        size: data.length,
        content: data.toString().substring(0, 200)
      });
    });
    
    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      logPhase('closed', { code, reason: reason.toString() });
      result.totalTime = Date.now() - startTime;
      resolve(result);
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      logPhase('error', { error: error.message });
      result.error = error.message;
      resolve(result);
    });
  });
}

// Test 3: Multiple Connection Pattern
async function testMultipleConnections() {
  console.log('\n🔄 Test 3: Multiple Connection Pattern');
  console.log('--------------------------------------');
  
  const connections = [];
  const results = [];
  
  for (let i = 0; i < 3; i++) {
    console.log(`\n🔗 Creating connection ${i + 1}/3`);
    
    const result = await new Promise((resolve) => {
      const startTime = Date.now();
      const ws = new WebSocket(COMM_SERVER);
      
      let connResult = {
        id: i + 1,
        success: false,
        connectionTime: null,
        error: null,
        duration: null
      };
      
      const timeout = setTimeout(() => {
        connResult.error = 'Connection timeout';
        try { ws.close(); } catch (e) {}
        resolve(connResult);
      }, 15000);
      
      ws.on('open', () => {
        connResult.success = true;
        connResult.connectionTime = Date.now() - startTime;
        console.log(`  ✅ Connection ${i + 1} established in ${connResult.connectionTime}ms`);
        
        setTimeout(() => {
          ws.close(1000, `Test connection ${i + 1} complete`);
        }, 3000);
      });
      
      ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        connResult.duration = Date.now() - startTime;
        console.log(`  🔚 Connection ${i + 1} closed after ${connResult.duration}ms`);
        resolve(connResult);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        connResult.error = error.message;
        console.log(`  ❌ Connection ${i + 1} error: ${error.message}`);
        resolve(connResult);
      });
    });
    
    results.push(result);
    
    // Small delay between connections
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

// Main test execution
async function runComprehensiveTest() {
  try {
    console.log(`🎯 Target: ${COMM_SERVER}`);
    console.log(`⏱️  Timeout: ${TIMEOUT / 1000} seconds\n`);
    
    // Run tests
    testResults.basicConnectivity = await testBasicConnectivity();
    testResults.handshakeAnalysis = await testHandshakePattern();
    testResults.messageFlow = await testMultipleConnections();
    
    // Analysis
    console.log('\n📊 COMPREHENSIVE ANALYSIS');
    console.log('=========================');
    
    console.log('\n🔍 Basic Connectivity:');
    if (testResults.basicConnectivity.success) {
      console.log(`  ✅ SUCCESS - Connected in ${testResults.basicConnectivity.connectionTime}ms`);
    } else {
      console.log(`  ❌ FAILED - ${testResults.basicConnectivity.error}`);
    }
    
    console.log('\n🤝 Handshake Analysis:');
    if (testResults.handshakeAnalysis.success) {
      console.log(`  ✅ SUCCESS - Completed in ${testResults.handshakeAnalysis.totalTime}ms`);
      console.log(`  📋 Phases: ${testResults.handshakeAnalysis.phases.length}`);
      testResults.handshakeAnalysis.phases.forEach(phase => {
        console.log(`    - ${phase.phase}: +${phase.timestamp}ms`);
      });
    } else {
      console.log(`  ❌ FAILED - ${testResults.handshakeAnalysis.error}`);
    }
    
    console.log('\n🔄 Multiple Connections:');
    const successful = testResults.messageFlow.filter(r => r.success);
    console.log(`  📈 Success Rate: ${successful.length}/${testResults.messageFlow.length}`);
    if (successful.length > 0) {
      const avgTime = successful.reduce((sum, r) => sum + r.connectionTime, 0) / successful.length;
      console.log(`  ⚡ Average Connection Time: ${Math.round(avgTime)}ms`);
    }
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS FOR LAMA & ONE.LEUTE');
    console.log('=======================================');
    
    if (testResults.basicConnectivity.success) {
      console.log('✅ Server connectivity is good');
      
      if (testResults.handshakeAnalysis.phases.some(p => p.phase === 'message_received')) {
        console.log('✅ Server responds to messages - protocol layer is active');
      } else {
        console.log('⚠️  Server accepts connections but no protocol messages received');
        console.log('   → Check if ONE protocol handshake is required');
      }
      
      const connectionTimes = successful.map(r => r.connectionTime);
      if (connectionTimes.some(t => t > 5000)) {
        console.log('⚠️  Some connections are slow (>5s)');
        console.log('   → Consider connection timeout adjustments in mobile app');
      }
      
      console.log('\n🔧 For debugging connection issues:');
      console.log('1. Enable comprehensive WebSocket monitoring in both apps');
      console.log('2. Check for protocol-level handshake timeouts');
      console.log('3. Monitor for premature connection closure during handshake');
      console.log('4. Verify ONE protocol message format compatibility');
      
    } else {
      console.log('❌ Basic connectivity failed');
      console.log('   → Check network/firewall issues');
      console.log('   → Verify comm server availability');
    }
    
  } catch (error) {
    console.error('💥 Test execution failed:', error);
  }
}

// Run the test
runComprehensiveTest().then(() => {
  console.log('\n🏁 Comprehensive WebSocket analysis complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
}); 