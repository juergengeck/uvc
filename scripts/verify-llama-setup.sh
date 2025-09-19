#!/bin/bash

echo "Verifying llama.rn setup..."

# Check if llama.rn is installed
if [ ! -d "node_modules/llama.rn" ]; then
    echo "ERROR: llama.rn not found in node_modules"
    echo "Run: npm install"
    exit 1
fi

# Check for podspec file
if [ ! -f "node_modules/llama.rn/llama-rn.podspec" ]; then
    echo "ERROR: llama-rn.podspec not found"
    exit 1
fi

# Check iOS directory structure
if [ -d "ios" ]; then
    echo "iOS directory exists"
    
    # Check if Pods directory exists
    if [ -d "ios/Pods" ]; then
        echo "Pods directory exists"
    else
        echo "WARNING: Pods directory missing - run 'cd ios && pod install'"
    fi
else
    echo "WARNING: iOS directory not found - run 'npx expo prebuild'"
fi

# Check for conflicting patches
if [ -f "patches/llama.rn+*.patch" ]; then
    echo "WARNING: Found llama.rn patches that might conflict"
    ls -la patches/llama.rn+*.patch
fi

echo "Verification complete"