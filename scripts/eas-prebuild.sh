#!/bin/bash

# EAS-safe prebuild script
echo "Starting EAS prebuild..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Not in project root directory"
    exit 1
fi

# Check if llama.rn exists before running setup
if [ -d "node_modules/llama.rn" ]; then
    echo "Running setup-modules..."
    npm run setup-modules || {
        echo "Warning: setup-modules failed, but continuing..."
    }
else
    echo "Warning: llama.rn not found in node_modules, skipping setup"
fi

echo "EAS prebuild completed"
exit 0