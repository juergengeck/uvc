#!/usr/bin/env node

/**
 * Check for malformed access grants on both simulator instances
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function checkMalformedGrants() {
  console.log('\n🔍 CHECKING FOR MALFORMED ACCESS GRANTS ON BOTH SIMULATORS');
  console.log('=' .repeat(60));
  
  // Check simulator 1 (demo user)
  console.log('\n📱 Simulator 1 (demo user):');
  try {
    const result1 = await execPromise(`
      xcrun simctl spawn booted log stream --predicate 'processImagePath contains "lamas"' --style json | 
      node -e "
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        
        // Send command to check malformed grants
        console.log('Sending diagnostic command...');
        
        // Use simctl to send the command
        const { exec } = require('child_process');
        exec('xcrun simctl openurl booted \"lamas://debug?command=checkMalformedAccessGrants()\"', (err) => {
          if (err) console.error('Error sending command:', err);
        });
        
        // Collect logs for 5 seconds
        let logs = [];
        rl.on('line', (line) => {
          try {
            const log = JSON.parse(line);
            if (log.eventMessage && log.eventMessage.includes('MALFORMED')) {
              logs.push(log.eventMessage);
            }
          } catch (e) {}
        });
        
        setTimeout(() => {
          console.log('\\nResults:');
          logs.forEach(log => console.log(log));
          process.exit(0);
        }, 5000);
      "
    `, { timeout: 10000 });
    
    console.log(result1.stdout);
  } catch (error) {
    console.error('Error checking simulator 1:', error.message);
  }
  
  // Check simulator 2 (demo1 user)
  console.log('\n📱 Simulator 2 (demo1 user):');
  try {
    const result2 = await execPromise(`
      xcrun simctl spawn $(xcrun simctl list devices | grep "iPhone 15 Pro" | grep -v "demo" | head -1 | grep -o "[0-9A-F]\\{8\\}-[0-9A-F]\\{4\\}-[0-9A-F]\\{4\\}-[0-9A-F]\\{4\\}-[0-9A-F]\\{12\\}") log stream --predicate 'processImagePath contains "lamas"' --style json | 
      node -e "
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        
        // Send command to check malformed grants
        console.log('Sending diagnostic command...');
        
        // Use simctl to send the command
        const { exec } = require('child_process');
        const deviceId = process.argv[1];
        exec('xcrun simctl openurl ' + deviceId + ' \"lamas://debug?command=checkMalformedAccessGrants()\"', (err) => {
          if (err) console.error('Error sending command:', err);
        });
        
        // Collect logs for 5 seconds
        let logs = [];
        rl.on('line', (line) => {
          try {
            const log = JSON.parse(line);
            if (log.eventMessage && log.eventMessage.includes('MALFORMED')) {
              logs.push(log.eventMessage);
            }
          } catch (e) {}
        });
        
        setTimeout(() => {
          console.log('\\nResults:');
          logs.forEach(log => console.log(log));
          process.exit(0);
        }, 5000);
      "
    `, { timeout: 10000 });
    
    console.log(result2.stdout);
  } catch (error) {
    console.error('Error checking simulator 2:', error.message);
  }
  
  console.log('\n💡 If malformed grants are found, you may need to clear app data on both simulators');
  console.log('   to remove the incorrectly formatted access grants created before the fix.\n');
}

// Alternative approach - directly inject the diagnostic function
async function injectDiagnostic() {
  console.log('\n🔧 Alternative: Injecting diagnostic function via React Native debugger...\n');
  
  const diagnosticCode = `
    // Check for malformed access grants
    (async function() {
      try {
        const { checkMalformedAccessGrants } = await import('/Users/gecko/src/lamas/src/utils/checkMalformedAccessGrants.ts');
        await checkMalformedAccessGrants();
      } catch (error) {
        console.error('Failed to run diagnostic:', error);
        
        // Try using the global function if available
        if (globalThis.checkMalformedAccessGrants) {
          await globalThis.checkMalformedAccessGrants();
        } else {
          console.log('Diagnostic function not available globally');
        }
      }
    })();
  `;
  
  console.log('To run the diagnostic manually on each simulator:');
  console.log('1. Open the React Native debugger for each app instance');
  console.log('2. Paste this code in the console:');
  console.log('-'.repeat(60));
  console.log(diagnosticCode);
  console.log('-'.repeat(60));
}

// Run both approaches
checkMalformedGrants().then(() => {
  injectDiagnostic();
}).catch(console.error);