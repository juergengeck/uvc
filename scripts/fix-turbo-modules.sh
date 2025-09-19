#!/bin/bash

# fix-turbo-modules.sh
# Script to fix TurboModule loading issues after React Native/Expo upgrades

set -e

echo "========================================"
echo "🔧 Fixing TurboModule Loading Issues 🔧"
echo "========================================"

# Clean the previous build artifacts
echo "📦 Cleaning previous builds..."
rm -rf ios/build
rm -rf android/app/build

# Clean the pod installation
echo "🧹 Cleaning Pod installation..."
cd ios
rm -rf Pods
rm -rf Podfile.lock
cd ..

# Make sure plugins are properly set up
echo "🔌 Checking Expo plugin configurations..."
if ! grep -q "./plugins/withLlamaFix.js" app.json; then
  echo "⚠️ withLlamaFix.js plugin not found in app.json, please add it manually"
fi

if ! grep -q "./plugins/withUdpHeaderPaths.js" app.json; then
  echo "⚠️ withUdpHeaderPaths.js plugin not found in app.json, please add it manually"
fi

# Apply prebuild to re-generate native code with our plugins
echo "🚀 Running Expo prebuild to apply fixes..."
npx expo prebuild --clean

# Install dependencies
echo "📥 Installing dependencies..."
cd ios
pod install
cd ..

# Build the app in debug mode for simulator
echo "🏗️ Building app for simulator..."
npx expo run:ios --no-start --device-id 'iPhone 15'

echo "========================================"
echo "✅ TurboModule fixes applied!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Run 'npx expo start' to start the development server"
echo "2. Open the app on your simulator or device"
echo "3. Check the logs for successful module loading"
echo ""
echo "If issues persist, check:"
echo "- AppDelegate.mm for proper TurboModule registration"
echo "- Native module implementations for compatibility with the new architecture"
echo "========================================" 