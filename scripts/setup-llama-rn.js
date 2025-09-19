/**
 * Setup script for llama.rn npm package
 * 
 * This script checks for the existence of the llama.rn npm package and applies necessary patches
 * to make it work with our project. It handles both iOS and Android platform configurations.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const LLAMA_RN_DIR = path.join(ROOT_DIR, 'node_modules', 'llama.rn');
const IOS_DIR = path.join(ROOT_DIR, 'ios');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');

// Create directory if it doesn't exist
const createDirectory = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
};

// Main setup function
const main = () => {
  try {
    console.log('Setting up llama.rn package...');
    
    // Check if llama.rn package exists
    if (!fs.existsSync(LLAMA_RN_DIR)) {
      console.error(`Error: llama.rn package not found at ${LLAMA_RN_DIR}`);
      console.log('Make sure you have installed the llama.rn npm package');
      return false;
    }
    
    console.log('Found llama.rn package');

    // iOS Setup
    if (fs.existsSync(IOS_DIR)) {
      console.log('Setting up llama.rn for iOS...');
      setupIOS();
    } else {
      console.log('iOS directory does not exist yet, iOS setup will happen after prebuild');
    }

    // Android Setup
    if (fs.existsSync(ANDROID_DIR)) {
      console.log('Setting up llama.rn for Android...');
      setupAndroid();
    } else {
      console.log('Android directory does not exist yet, Android setup will happen after prebuild');
      
      // Ensure Android directory exists for Metro bundler
      createDirectory(ANDROID_DIR);
    }
    
    console.log('llama.rn setup completed successfully');
    return true;
  } catch (error) {
    console.error('Error setting up llama.rn:', error);
    return false;
  }
};

// iOS-specific setup
const setupIOS = () => {
  // Check if Podspec exists - Use llama-rn.podspec (with hyphen) instead of llama.rn.podspec
  const podspecPath = path.join(LLAMA_RN_DIR, 'llama-rn.podspec');
  if (!fs.existsSync(podspecPath)) {
    console.error(`Error: llama-rn.podspec not found at ${podspecPath}`);
    return false;
  }
  
  console.log('Found llama-rn.podspec');
  
  // Read the podspec
  let podspecContent = fs.readFileSync(podspecPath, 'utf8');
  
  // Check if podspec already patched
  if (!podspecContent.includes('# BEGIN Lama App patch') && !podspecContent.includes('# END Lama App patch')) {
    console.log('Patching llama-rn.podspec to avoid duplicate header files issues...');
    
    // Patch to avoid duplicate header files
    podspecContent = podspecContent.replace(
      /'react-native-safe-area-context'/g,
      "'React-RCTAppDelegate', 'React-debug', 'react-native-safe-area-context'"
    );
    
    // Add a marker to indicate we've patched this file
    podspecContent = podspecContent.replace(
      /Pod::Spec.new do \|s\|/,
      "Pod::Spec.new do |s|\n  # BEGIN Lama App patch - Don't modify this section\n  # Patched to avoid duplicate header files\n  # END Lama App patch"
    );
    
    // Write back the patched podspec
    fs.writeFileSync(podspecPath, podspecContent);
    console.log('Patched llama-rn.podspec');
  } else {
    console.log('llama-rn.podspec already patched');
  }
  
  // Create a bash script to fix any remaining header reference issues
  const fixHeadersScriptPath = path.join(SCRIPTS_DIR, 'fix-llama-rn-headers.sh');
  if (!fs.existsSync(fixHeadersScriptPath)) {
    console.log('Creating fix-llama-rn-headers.sh script...');
    
    const fixHeadersScript = `#!/bin/bash

# Script to fix header references for llama-rn if issues remain
# Gets called from the post_install hook in the patched Podfile

PODS_DIR="$PODS_ROOT"
if [ -z "$PODS_ROOT" ]; then
  PODS_DIR="./ios/Pods"
fi

echo "Ensuring React debug headers are available for llama-rn..."

REACT_DEBUG_HEADERS="$PODS_DIR/Headers/Public/React-debug/react/debug"
REACT_NATIVE_SRC="$PODS_ROOT/../../node_modules/react-native/ReactCommon/react/debug"

# Create the directory structure if it doesn't exist
mkdir -p "$REACT_DEBUG_HEADERS"

# Copy React Native debug headers to the Pods directory
if [ -d "$REACT_NATIVE_SRC" ]; then
  echo "Copying React debug headers to $REACT_DEBUG_HEADERS"
  cp -f "$REACT_NATIVE_SRC/react_native_assert.h" "$REACT_DEBUG_HEADERS/" 2>/dev/null || true
  cp -f "$REACT_NATIVE_SRC/react_native_expect.h" "$REACT_DEBUG_HEADERS/" 2>/dev/null || true
  cp -f "$REACT_NATIVE_SRC/flags.h" "$REACT_DEBUG_HEADERS/" 2>/dev/null || true
fi

# Success message
echo "llama-rn header setup completed"
exit 0
`;
    
    // Write the fix headers script
    fs.writeFileSync(fixHeadersScriptPath, fixHeadersScript);
    
    // Make the script executable
    execSync(`chmod +x "${fixHeadersScriptPath}"`);
    console.log('Created fix-llama-rn-headers.sh script');
  } else {
    console.log('fix-llama-rn-headers.sh script already exists');
  }
  
  return true;
};

// Android-specific setup
const setupAndroid = () => {
  console.log('Checking Android configuration for llama.rn...');
  
  // Make sure required Android directories exist
  const srcMainDir = path.join(ANDROID_DIR, 'app', 'src', 'main');
  const javaDir = path.join(srcMainDir, 'java');
  const cppDir = path.join(srcMainDir, 'cpp');
  
  createDirectory(srcMainDir);
  createDirectory(javaDir);
  createDirectory(cppDir);
  
  // Update .watchmanconfig to ignore llama.rn directories that cause issues
  const watchmanConfigPath = path.join(ROOT_DIR, '.watchmanconfig');
  if (fs.existsSync(watchmanConfigPath)) {
    console.log('Updating .watchmanconfig to ignore llama.rn build directories...');
    
    let watchmanConfig = {};
    try {
      watchmanConfig = JSON.parse(fs.readFileSync(watchmanConfigPath, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse .watchmanconfig, creating a new one');
      watchmanConfig = {};
    }
    
    if (!watchmanConfig.ignore_dirs) {
      watchmanConfig.ignore_dirs = [];
    }
    
    // Add llama.rn directories to ignore list if not already present
    const dirsToIgnore = [
      'node_modules/llama.rn/ios',
      'node_modules/llama.rn/cpp',
      'node_modules/llama.rn/android/build'
    ];
    
    let updated = false;
    for (const dir of dirsToIgnore) {
      if (!watchmanConfig.ignore_dirs.includes(dir)) {
        watchmanConfig.ignore_dirs.push(dir);
        updated = true;
      }
    }
    
    if (updated) {
      fs.writeFileSync(watchmanConfigPath, JSON.stringify(watchmanConfig, null, 2));
      console.log('Updated .watchmanconfig');
    } else {
      console.log('.watchmanconfig already configured for llama.rn');
    }
  }
  
  return true;
};

// Run the main function
if (require.main === module) {
  // Process command line arguments
  const args = process.argv.slice(2);
  
  // Parse arguments if needed (currently we just ignore them)
  // This allows the script to be called with --platform ios/android without failing
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform') {
      // Skip the platform argument and its value
      i++; // Skip the next argument (platform value)
    }
  }
  
  const success = main();
  process.exit(success ? 0 : 1);
}

module.exports = main; 