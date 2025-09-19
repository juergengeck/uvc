#!/bin/bash

# This script applies llama.rn fixes before running expo commands directly
# Run this if you're using 'npx expo run:ios' instead of the npm scripts

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.." # Go to project root

echo "=== Applying llama.rn fixes ==="

# Run the llama-rn fix scripts
PODS_ROOT="./ios/Pods" scripts/fix-llama-rn-headers.sh
ruby scripts/fix-llama-rn-pod.rb
ruby scripts/fix-llama-headers.rb

echo "=== Fixes applied ==="
echo "You can now run 'npx expo run:ios' safely" 