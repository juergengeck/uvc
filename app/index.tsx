import { Redirect } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { routes } from '../src/config/routes';
import { getAuthenticator } from '@src/initialization';

console.log('=== LOADING INDEX PAGE ===');

/**
 * App entry point that redirects based on authentication state.
 * The credential restoration logic is handled in _layout.tsx during initialization.
 * This component just routes based on the current auth state.
 */
export default function Index() {
  // Get authentication state only
  const auth = getAuthenticator();
  const authState = auth?.authState?.currentState;
  
  console.log(`[Index] RENDERING - Auth state: ${authState}`);
  
  // Simple routing logic - either logged in or not
  // The credential restoration happens in _layout.tsx, so by the time we get here
  // the auth state should reflect whether auto-login was successful
  if (authState === 'logged_in') {
    console.log('[Index] User is logged in, redirecting to tabs');
    return (
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <Redirect href={routes.tabs.index} />
      </View>
    );
  } else {
    // For any other state (logged_out, logging_in, undefined), go to login
    // New users will be created automatically on first login
    console.log('[Index] User not logged in, redirecting to login');
    return (
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <Redirect href={routes.auth.login} />
      </View>
    );
  }
} 