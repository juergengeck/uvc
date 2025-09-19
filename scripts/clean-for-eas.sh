#!/bin/bash

echo "Cleaning project for EAS build..."

# Remove problematic directories
rm -rf ios/build
rm -rf ios/Pods
rm -rf node_modules
rm -rf android/build
rm -rf android/app/build

# Clear caches
rm -rf ~/.expo
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-*

# Remove lock files to ensure fresh install
rm -f package-lock.json
rm -f yarn.lock
rm -f ios/Podfile.lock

echo "Clean complete. Now run:"
echo "1. npm install"
echo "2. npx expo prebuild --clean"
echo "3. eas build --platform ios"