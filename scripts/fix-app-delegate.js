#!/usr/bin/env node

/**
 * Script to fix the AppDelegate.swift file after prebuild
 * Ensures the correct import statement is used
 */

const fs = require('fs');
const path = require('path');

const TARGET_APP_DELEGATE_PATH = path.join(process.cwd(), 'ios/lamaone/AppDelegate.swift');

const fixAppDelegate = () => {
  console.log('Fixing AppDelegate.swift import...');

  // Check if target file exists
  if (!fs.existsSync(TARGET_APP_DELEGATE_PATH)) {
    console.error(`Error: File not found at ${TARGET_APP_DELEGATE_PATH}`);
    return false;
  }

  try {
    // Read the AppDelegate file
    const content = fs.readFileSync(TARGET_APP_DELEGATE_PATH, 'utf8');
    console.log(`Read ${TARGET_APP_DELEGATE_PATH} successfully.`);

    // Split into lines
    const lines = content.split('\n');

    // Check the first line for ExpoModulesCore import and replace it with Expo
    if (lines[0].includes('import ExpoModulesCore')) {
      lines[0] = 'import Expo';
      console.log('Replaced "import ExpoModulesCore" with "import Expo"');

      // Write the file back
      fs.writeFileSync(TARGET_APP_DELEGATE_PATH, lines.join('\n'));
      console.log(`Updated ${TARGET_APP_DELEGATE_PATH} successfully.`);

      // Make sure it's writable
      fs.chmodSync(TARGET_APP_DELEGATE_PATH, '644');
      console.log(`Updated file permissions for AppDelegate.`);
      return true;
    } else if (lines[0].includes('import Expo')) {
      console.log('Expo import already present, no changes needed.');
      return true;
    } else {
      console.log(`Unexpected first line: "${lines[0]}"`);
      return false;
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return false;
  }
};

// Run the function
const success = fixAppDelegate();
process.exit(success ? 0 : 1);