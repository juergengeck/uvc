/**
 * Main App Component
 * 
 * This is a simple wrapper around the Expo Router App component.
 * It's used to ensure proper registration of the main component.
 * 
 * IMPORTANT: This must include the same critical initialization that was in index.js
 * to ensure proper platform setup before any native modules are accessed.
 */

import React from 'react';

// CRITICAL: Import debug configuration first (from index.js)
import './src/config/debug.ts';

// CRITICAL: Initialize platform-specific code (from index.js)
import './src/platform/index.ts';

import { App as ExpoRouterApp } from 'expo-router/build/qualified-entry';
// Use absolute path import for react-native to avoid resolution issues
import { LogBox } from './node_modules/react-native';

// Suppress specific warning messages
LogBox.ignoreLogs([
  'Failed to get size for image',
  'Sending `onAnimatedValueUpdate`',
  '`new NativeEventEmitter()`', // Suppress NativeEventEmitter warnings
  'Require cycle',
  'ReactNativeFiberHostComponent',
  'Animating height of',
  'NativeAnimated'
]);

export default function App() {
  return <ExpoRouterApp />;
} 