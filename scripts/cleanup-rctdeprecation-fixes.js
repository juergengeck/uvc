#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * This script cleans up any manual fixes we previously added for the RCTDeprecation module.
 * It ensures we rely on CocoaPods to properly generate module maps instead of manual hacks.
 */

console.log('🧹 Cleaning up manual RCTDeprecation fixes...');

const iosDir = path.join(__dirname, '../ios');

// Files to remove
const filesToRemove = [
  path.join(iosDir, 'prefix-headers/RCTDeprecationHelper.h'),
  path.join(iosDir, 'RCTDeprecationImport.h'),
  path.join(iosDir, 'Pods/Headers/Public/RCTDeprecation/module.modulemap'),
];

// Clean up files
filesToRemove.forEach(file => {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`✅ Removed ${file}`);
    } catch (err) {
      console.error(`❌ Error removing ${file}: ${err.message}`);
    }
  } else {
    console.log(`ℹ️ File not found, skipping: ${file}`);
  }
});

// Check for bridging header to clean up
const potentialBridgingHeaders = [
  path.join(iosDir, 'lamaone-Bridging-Header.h'),
  path.join(iosDir, 'lamaone/lamaone-Bridging-Header.h')
];

for (const headerPath of potentialBridgingHeaders) {
  if (fs.existsSync(headerPath)) {
    try {
      let content = fs.readFileSync(headerPath, 'utf8');
      
      // Remove our custom imports
      const originalContent = content;
      content = content.replace(/\/\/\s*Add RCTDeprecation.*\n#import ".*RCTDeprecation.*\.h"\s*\n/g, '');
      content = content.replace(/\/\/\s*Add RCTDeprecation.*\n@import RCTDeprecation;\s*\n/g, '');
      
      if (content !== originalContent) {
        fs.writeFileSync(headerPath, content);
        console.log(`✅ Cleaned up ${headerPath}`);
      } else {
        console.log(`ℹ️ No cleanup needed in ${headerPath}`);
      }
    } catch (err) {
      console.error(`❌ Error cleaning up ${headerPath}: ${err.message}`);
    }
  }
}

console.log('✅ Cleanup complete. Now run `npx expo prebuild --clean` to rebuild with proper settings.'); 