#!/usr/bin/env ts-node

/**
 * CommServer Integration Test Runner
 * 
 * This script runs the comprehensive CommServer integration test and provides
 * detailed output about the test results.
 * 
 * Usage:
 *   npx ts-node src/scripts/runCommServerTest.ts
 *   or
 *   npm run test:commserver
 */

import { runCommServerIntegrationTest } from '../tests/CommServerIntegrationTest';

async function main() {
  console.log('🚀 Starting CommServer Integration Test...\n');
  
  try {
    const results = await runCommServerIntegrationTest();
    
    // Calculate summary
    const total = results.length;
    const passed = results.filter(r => r.success).length;
    const failed = total - passed;
    const successRate = total > 0 ? (passed / total) * 100 : 0;
    
    console.log('\n📊 DETAILED TEST RESULTS:');
    console.log('='.repeat(60));
    
    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.step}`);
      console.log(`   Message: ${result.message}`);
      
      if (result.data) {
        console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
      }
      
      if (result.error) {
        console.log(`   Error: ${result.error.message}`);
        if (result.error.stack) {
          console.log(`   Stack: ${result.error.stack}`);
        }
      }
      
      console.log('');
    });
    
    console.log('='.repeat(60));
    console.log(`📈 FINAL SUMMARY:`);
    console.log(`   Total Tests: ${total}`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`);
    
    if (failed === 0) {
      console.log('\n🎉 All tests passed! CommServer integration is working correctly.');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Please review the errors above.`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the test
main().catch(error => {
  console.error('Main function failed:', error);
  process.exit(1);
}); 