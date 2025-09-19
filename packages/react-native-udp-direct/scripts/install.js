#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Installing react-native-udp-direct...');

// Check if we're in a React Native project
const projectRoot = process.cwd();
const packageJsonPath = path.join(projectRoot, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Error: package.json not found. Make sure you run this from your React Native project root.');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const hasReactNative = packageJson.dependencies && packageJson.dependencies['react-native'];

if (!hasReactNative) {
  console.error('❌ Error: react-native not found in dependencies. Is this a React Native project?');
  process.exit(1);
}

console.log('✅ React Native project detected');

// Platform-specific instructions
console.log('\n📱 iOS Setup:');
console.log('1. Run: cd ios && pod install');
console.log('2. Clean and rebuild your project');

console.log('\n🤖 Android Setup:');
console.log('Android support is coming soon!');

console.log('\n📚 Usage:');
console.log('import UDPDirectModule from \'@lama/react-native-udp-direct\';');
console.log('\n✨ Installation complete! Check the README for usage examples.');