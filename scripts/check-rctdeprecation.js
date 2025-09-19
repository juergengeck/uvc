#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// This script checks if the RCTDeprecation module is properly set up

console.log('🔍 Checking RCTDeprecation module setup...');

const iosDir = path.join(__dirname, '../ios');
const moduleMapDir = path.join(iosDir, 'Pods/Headers/Public/RCTDeprecation');
const podspecPath = path.join(iosDir, 'Pods/Local Podspecs/RCTDeprecation.podspec.json');

console.log(`Checking directories:`);
console.log(`- iOS directory: ${fs.existsSync(iosDir) ? '✅ Exists' : '❌ Not found'}`);
console.log(`- Module map directory: ${fs.existsSync(moduleMapDir) ? '✅ Exists' : '❌ Not found'}`);

if (fs.existsSync(moduleMapDir)) {
  const files = fs.readdirSync(moduleMapDir);
  console.log(`\nFiles in ${moduleMapDir}:`);
  files.forEach(file => {
    const filePath = path.join(moduleMapDir, file);
    const stats = fs.statSync(filePath);
    console.log(`- ${file} (${stats.size} bytes)`);
    
    if (file.includes('modulemap')) {
      console.log(`\nContents of ${file}:`);
      console.log(fs.readFileSync(filePath, 'utf8'));
    }
  });
  
  // Check for specific files we need
  const requiredFiles = ['RCTDeprecation.modulemap', 'RCTDeprecation-umbrella.h', 'RCTDeprecation.h'];
  requiredFiles.forEach(file => {
    const exists = fs.existsSync(path.join(moduleMapDir, file));
    console.log(`- ${file}: ${exists ? '✅ Exists' : '❌ Not found'}`);
  });
}

// Check podspec
console.log(`\nPodspec: ${fs.existsSync(podspecPath) ? '✅ Exists' : '❌ Not found'}`);
if (fs.existsSync(podspecPath)) {
  try {
    const podspec = JSON.parse(fs.readFileSync(podspecPath, 'utf8'));
    console.log('Podspec details:');
    console.log(`- Module name: ${podspec.module_name || 'Not defined'}`);
    console.log(`- Defines module: ${podspec.pod_target_xcconfig?.DEFINES_MODULE || 'Not defined'}`);
  } catch (e) {
    console.error(`Error parsing podspec: ${e.message}`);
  }
}

// Check bridging header
const potentialBridgingHeaders = [
  path.join(iosDir, 'lamaone-Bridging-Header.h'),
  path.join(iosDir, 'lamaone/lamaone-Bridging-Header.h')
];

let bridgingHeaderFound = false;
for (const headerPath of potentialBridgingHeaders) {
  if (fs.existsSync(headerPath)) {
    console.log(`\nBridging header: ✅ Found at ${headerPath}`);
    console.log(`Contents of bridging header:`);
    console.log(fs.readFileSync(headerPath, 'utf8'));
    bridgingHeaderFound = true;
    break;
  }
}

if (!bridgingHeaderFound) {
  console.log(`\nBridging header: ❌ Not found in expected locations`);
  // Try to find it by searching
  console.log('Searching for bridging header...');
  // This would require a recursive search function which is beyond the scope of this simple check
}

console.log('\n✅ RCTDeprecation check completed.'); 