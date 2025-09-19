# Llama.rn Integration

This document explains how we integrate the llama.rn npm package in our app.

## Overview

We've migrated from a custom Llama module to using the official `llama.rn` npm package. The package provides a native bridge to the Llama LLM for iOS and Android.

## Setup Process

Our setup consists of these steps:

1. `npm install llama.rn` - Install the npm package
2. `npm run setup-llama` - Runs our setup script that patches the podspec
3. `npm run prebuild:clean` - Prepares the iOS and Android projects with proper configuration

## How It Works

### 1. Podspec Patching

We patch the `llama-rn.podspec` to resolve duplicate header issues that can occur during the build process. The patch:
- Adds a custom prepare command
- Sets Swift include paths to ensure consistent header inclusion
- Prevents duplicate files from being processed

### 2. TypeScript Integration

We provide proper TypeScript typings in `src/types/llama.rn.d.ts` that match the actual API of the npm package.

### 3. JS/TS Usage

The module is imported throughout our code:

```typescript
// Direct import
import LlamaRN from 'llama.rn';

// Named imports
import { initLlama, predict, releaseContext } from 'llama.rn';
```

## Models

Our main interfaces for the module:

- `LlamaModel` - Main singleton for managing the LLM
- `llamaRNBridge` - Bridge utility that provides a stable API

## Troubleshooting

If you encounter build issues related to duplicate headers:

1. Try the emergency fix: `npm run fix-llama-pod`
2. Clean and rebuild: `npm run build:ios:with-fix`

If you need to clean up after previous installations:

```bash
npm run cleanup-llama
```

## Implementation Details

The integration uses the following pattern:

1. Load the LLM model file
2. Initialize the model with `initLlama`
3. Generate completions with `predict`
4. Release resources with `releaseContext`

The API is exposed through our `LlamaModel` singleton which can be accessed via `LlamaModel.getInstance()`. 