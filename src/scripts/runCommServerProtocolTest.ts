/**
 * Script to run CommServer protocol tests
 * Tests the complete CommServer communication flow
 */

import CommServerProtocolTest from '../tests/CommServerProtocolTest';

/**
 * Run all CommServer protocol tests
 */
async function runCommServerProtocolTests(): Promise<void> {
  console.log('🧪 Starting CommServer Protocol Test Suite...');
  console.log('=' .repeat(50));
  
  const testSuite = new CommServerProtocolTest();
  
  try {
    // Run the complete test suite
    const results = await testSuite.runFullTest();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Results Summary:');
    console.log('=' .repeat(50));
    
    let passed = 0;
    let failed = 0;
    
    for (const result of results) {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${result.step}: ${result.details}`);
      
      if (result.success) {
        passed++;
      } else {
        failed++;
      }
    }
    
    console.log('\n' + '-'.repeat(30));
    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n💥 Some tests failed!');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test suite execution failed:', error);
    process.exit(1);
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  runCommServerProtocolTests()
    .then(() => {
      console.log('Test execution completed');
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { runCommServerProtocolTests };
export default runCommServerProtocolTests; 