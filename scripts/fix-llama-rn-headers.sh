#!/bin/bash

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
