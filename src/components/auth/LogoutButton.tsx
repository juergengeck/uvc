/**
 * Logout Button Component
 * 
 * Provides a button to logout the current user and clear all stored data.
 * Can be used in settings screens, profile screens, or anywhere logout is needed.
 */

import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button } from 'react-native-paper';
import { logout } from '@src/initialization';

interface LogoutButtonProps {
  mode?: 'text' | 'outlined' | 'contained' | 'elevated' | 'contained-tonal';
  style?: any;
  onLogoutStart?: () => void;
  onLogoutComplete?: () => void;
  onLogoutError?: (error: Error) => void;
}

/**
 * Logout Button Component
 * 
 * @param props - Component props
 * @returns {JSX.Element} Logout button component
 */
export function LogoutButton({ 
  mode = 'outlined', 
  style,
  onLogoutStart,
  onLogoutComplete,
  onLogoutError
}: LogoutButtonProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    // Show confirmation dialog
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? You will need to login again next time.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            onLogoutStart?.();

            try {
              console.log('[LogoutButton] Starting logout process...');
              await logout();
              console.log('[LogoutButton] Logout completed successfully');
              onLogoutComplete?.();
            } catch (error) {
              console.error('[LogoutButton] Logout failed:', error);
              const errorObj = error instanceof Error ? error : new Error('Logout failed');
              onLogoutError?.(errorObj);
              
              Alert.alert(
                'Logout Error',
                'Failed to logout properly. Please try again.',
                [{ text: 'OK' }]
              );
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Button
      mode={mode}
      onPress={handleLogout}
      loading={isLoggingOut}
      disabled={isLoggingOut}
      style={style}
    >
      {isLoggingOut ? 'Logging out...' : 'Logout'}
    </Button>
  );
} 