#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// This script creates a helper header file that explicitly imports the RCTDeprecation module
// This ensures Swift compilation can correctly find and use the module

console.log('🔧 Adding RCTDeprecation module import helper...');

const iosDir = path.join(__dirname, '../ios');
const prefixHeadersDir = path.join(iosDir, 'prefix-headers');

// Create the prefix-headers directory if it doesn't exist
if (!fs.existsSync(prefixHeadersDir)) {
  console.log(`Creating directory: ${prefixHeadersDir}`);
  fs.mkdirSync(prefixHeadersDir, { recursive: true });
}

// Create a helper header that imports the module map
const rctDeprecationHelperPath = path.join(prefixHeadersDir, 'RCTDeprecationHelper.h');
const helperContent = `
// RCTDeprecationHelper.h
// Helper header to ensure RCTDeprecation module is properly loaded
// Created by fix-rctdeprecation-import.js

#ifndef RCTDeprecationHelper_h
#define RCTDeprecationHelper_h

@import RCTDeprecation;

#endif /* RCTDeprecationHelper_h */
`;

fs.writeFileSync(rctDeprecationHelperPath, helperContent);
console.log(`✅ Created helper header at: ${rctDeprecationHelperPath}`);

// Now also add a direct module.modulemap file
const moduleMapDir = path.join(iosDir, 'Pods/Headers/Public/RCTDeprecation');
if (fs.existsSync(moduleMapDir)) {
  const moduleMapPath = path.join(moduleMapDir, 'module.modulemap');
  if (!fs.existsSync(moduleMapPath)) {
    const moduleMapContent = `
module RCTDeprecation {
  umbrella header "RCTDeprecation-umbrella.h"
  export *
  module * { export * }
}
`;
    fs.writeFileSync(moduleMapPath, moduleMapContent);
    console.log(`✅ Created module.modulemap at: ${moduleMapPath}`);
  } else {
    console.log(`ℹ️ module.modulemap already exists at: ${moduleMapPath}`);
  }
}

// Create a direct header import file that can be included in Swift bridging header
// This file will be placed in the project root
const directImportPath = path.join(iosDir, 'RCTDeprecationImport.h');
const directImportContent = `
// RCTDeprecationImport.h
// Direct import header for RCTDeprecation module
// Created by fix-rctdeprecation-import.js

#ifndef RCTDeprecationImport_h
#define RCTDeprecationImport_h

// Direct import of the module headers
#import <RCTDeprecation/RCTDeprecation.h>
#import <RCTDeprecation/RCTDeprecation-umbrella.h>

#endif /* RCTDeprecationImport_h */
`;
fs.writeFileSync(directImportPath, directImportContent);
console.log(`✅ Created direct import header at: ${directImportPath}`);

// Now add this to the Swift bridging header if needed
const potentialBridgingHeaders = [
  path.join(iosDir, 'lamaone-Bridging-Header.h'),
  path.join(iosDir, 'lamaone/lamaone-Bridging-Header.h')
];

let bridgingHeaderPath = null;
for (const headerPath of potentialBridgingHeaders) {
  if (fs.existsSync(headerPath)) {
    bridgingHeaderPath = headerPath;
    break;
  }
}

if (bridgingHeaderPath) {
  let bridgingContent = fs.readFileSync(bridgingHeaderPath, 'utf8');
  
  // Remove any existing RCTDeprecation imports that might be wrong
  bridgingContent = bridgingContent.replace(/\/\/ Add RCTDeprecation helper import\s*\n\s*#import "prefix-headers\/RCTDeprecationHelper\.h"\s*\n?/g, '');
  
  if (!bridgingContent.includes('RCTDeprecationImport.h')) {
    bridgingContent += '\n// Add RCTDeprecation direct import\n#import "../RCTDeprecationImport.h"\n';
    fs.writeFileSync(bridgingHeaderPath, bridgingContent);
    console.log(`✅ Added RCTDeprecationImport.h import to bridging header: ${bridgingHeaderPath}`);
  } else {
    console.log(`ℹ️ RCTDeprecationImport.h already imported in bridging header: ${bridgingHeaderPath}`);
  }
} else {
  console.log('⚠️ No Swift bridging header found. You may need to manually add the import.');
}

console.log('✅ RCTDeprecation import fix script completed.'); 