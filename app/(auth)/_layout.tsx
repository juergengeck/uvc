import { Redirect, Stack } from 'expo-router';
import { AuthProvider } from '@src/providers/app/AuthProvider';
import { useTheme } from '@src/providers/app/AppTheme';
import { getAuthenticator } from '@src/initialization';
import { useEffect, useState } from 'react';

console.log('[AuthLayout] Starting to load auth layout');

export default function AuthLayout() {
  console.log('[AuthLayout] Rendering auth layout');
  const [authenticator, setAuthenticator] = useState(getAuthenticator());
  const { theme } = useTheme();
  
  // Ensure we have the latest authenticator
  useEffect(() => {
    const auth = getAuthenticator();
    if (auth) {
      setAuthenticator(auth);
    }
  }, []);

  if (!authenticator) {
    console.log('[AuthLayout] No authenticator available');
    return null;
  }

  // OneProvider mounts this route again once the logged-in model is ready.
  if (authenticator.authState.currentState === 'logged_in') {
    return <Redirect href="/(tabs)/journal" />;
  }
  
  return (
    <AuthProvider authenticator={authenticator}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { 
            backgroundColor: theme?.colors.background 
          },
          animation: 'none',
          presentation: 'card'
        }}
      />
    </AuthProvider>
  );
}
