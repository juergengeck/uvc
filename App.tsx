/**
 * Main App component
 * 
 * This is the root component that gets registered with Expo.
 * It loads the actual app with proper initialization.
 */

import React from 'react';
import { Slot } from 'expo-router';

export default function App() {
  return <Slot />;
} 