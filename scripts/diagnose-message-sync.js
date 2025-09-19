#!/usr/bin/env node

/**
 * Quick diagnostic to check why messages aren't syncing
 */

const { exec } = require('child_process');

console.log('\n🔍 DIAGNOSING MESSAGE SYNC ISSUE');
console.log('=' .repeat(60));

// Check both simulators for key events
const checks = [
  'CHUM SYNC REQUEST DETECTED',
  'Pairing success',
  'Creating contact and topic',
  'Topic created:',
  'Granted access to',
  'synchronisation',
  'CHUM REQUEST',
  'CHUM RESPONSE',
  'CHUM ERROR'
];

console.log('Monitoring for these key events:');
checks.forEach(check => console.log(`  - ${check}`));
console.log('\nMonitoring logs...\n');

// Monitor simulator 1
const monitor1 = exec(`
  xcrun simctl spawn booted log stream --predicate 'processImagePath contains "lamas"' | grep -E "(${checks.join('|')})"
`);

monitor1.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  lines.forEach(line => {
    console.log('[SIM1] ', line.trim());
  });
});

monitor1.stderr.on('data', (data) => {
  console.error('[SIM1-ERROR]', data.toString());
});

console.log('\n💡 Try these actions:');
console.log('1. Send a message from one device');
console.log('2. Create a new pairing if needed');
console.log('3. Check if topics exist in the topic list\n');
console.log('Press Ctrl+C to stop monitoring.\n');