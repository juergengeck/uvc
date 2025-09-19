#!/bin/bash

# This script applies fixes needed after expo prebuild
# Run this script anytime you run expo prebuild

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Applying post-prebuild fixes ==="

# Make sure our script is executable
chmod +x "$SCRIPT_DIR/fix-llama-rn-headers.sh"
chmod +x "$SCRIPT_DIR/fix-llama-rn-pod.rb"

# Ensure Podfile has our fix
PODFILE="$ROOT_DIR/ios/Podfile"
if ! grep -q "fix-llama-rn-pod.rb" "$PODFILE"; then
  echo "Adding llama.rn fix to Podfile..."
  
  # Create a backup
  cp "$PODFILE" "$PODFILE.bak"
  
  # Add our fix code before the last 'end'
  awk -v insert='    # Fix llama.rn duplicate header issues\n    system('"'"'ruby'"'"', '"'"'../scripts/fix-llama-rn-pod.rb'"'"')' '
  /^  end$/ && !done {
    print "    " insert;
    done=1
  }
  { print }
  ' "$PODFILE.bak" > "$PODFILE"
fi

echo "=== Running pod install with fixes ==="

# Navigate to iOS directory and run pod install
cd "$ROOT_DIR/ios" || exit 1
pod install

echo "=== Post-prebuild fixes applied successfully ==="
echo "You can now run 'npm run ios' to build and run the app" 