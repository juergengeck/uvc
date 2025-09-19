#!/bin/bash

# Script to fix EAS build issues related to provisioning profiles
# Based on solution from https://github.com/expo/eas-cli/issues/3009

echo "🔧 EAS Credentials Fix Script"
echo "==============================="
echo ""
echo "This script helps resolve the 'Service not available because of maintenance activities' error"
echo "by cleaning up provisioning profiles."
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI is not installed. Please install it with: npm install -g eas-cli"
    exit 1
fi

echo "📋 Current EAS CLI version:"
eas --version
echo ""

echo "🔑 Opening EAS credentials manager..."
echo "Follow these steps:"
echo "1. Select 'iOS'"
echo "2. Select your build profile (development/preview/production)"
echo "3. Navigate to 'Build Credentials' → 'Provisioning Profile'"
echo "4. Select 'Delete' to remove existing profiles"
echo ""
echo "After deleting, you can either:"
echo "- Let EAS create new profiles automatically during the next build"
echo "- Manually create new profiles in Apple Developer Portal"
echo ""

# Open credentials manager
eas credentials

echo ""
echo "✅ Credentials cleanup complete!"
echo ""
echo "📱 Additional steps to ensure clean build:"
echo "1. Visit https://developer.apple.com/account/resources/profiles/list"
echo "2. Delete any expired or duplicate provisioning profiles for your app"
echo "3. Clear local Expo/EAS caches:"
echo "   - rm -rf ~/.expo"
echo "   - rm -rf ~/Library/Caches/expo"
echo ""
echo "🚀 Ready to build? Run:"
echo "   eas build --platform ios --profile development"
echo ""