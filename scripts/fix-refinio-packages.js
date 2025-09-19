#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Fix @refinio/one.models package.json to use proper dependency
const oneModelsPackagePath = path.join(__dirname, '..', 'node_modules', '@refinio', 'one.models', 'package.json');

if (fs.existsSync(oneModelsPackagePath)) {
  const packageJson = JSON.parse(fs.readFileSync(oneModelsPackagePath, 'utf8'));

  let modified = false;
  if (packageJson.dependencies && packageJson.dependencies['@refinio/one.core'] === '../one.core') {
    console.log('Fixing @refinio/one.models dependency on @refinio/one.core...');
    packageJson.dependencies['@refinio/one.core'] = '0.6.1-beta-1';
    modified = true;
  }

  // Remove problematic exports map patterns that break Metro (leave root entry only)
  if (packageJson.exports) {
    const { exports } = packageJson;
    const allowedRoot = exports["."]; // keep existing root mapping if present

    if (Object.keys(exports).length !== 1 || exports["./lib/*"]) {
      console.log('Cleaning up malformed "exports" field in @refinio/one.models to appease Metro...');
      packageJson.exports = { ".": allowedRoot || {
        "types": "./lib/models/index.d.ts",
        "import": "./lib/models/index.js",
        "require": "./lib/models/index.js"
      } };
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(oneModelsPackagePath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('Patched @refinio/one.models package.json');
  }
}