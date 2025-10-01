/**
 * Login Page Component
 * 
 * Handles user authentication through email/password login.
 * Features:
 * - Email/password form with validation
 * - Error handling and display
 * - Loading state management
 * - Demo credentials prefilled
 * - Automatic instance creation for new users
 */

import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, TextInput as TextInputRN } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@src/providers/app/AuthProvider';
import { AuthLogo } from '@src/components/auth/AuthLogo';
import { APP_CONFIG } from '@src/config/app';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { instanceExists } from '@refinio/one.core/lib/instance';

// Demo credentials
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo123';

/**
 * Login Page Component
 * Automatically creates a new instance for unknown users
 * 
 * @returns {JSX.Element} Login page component
 */
export default function LoginScreen() {
  const [username, setUsername] = useState(DEMO_USERNAME);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const { authenticator } = useAuth();
  const theme = useTheme();
  const { styles: themedStyles } = useAppTheme();
  const router = useRouter();

  const handleLogin = async () => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      console.log('[Login] Attempting login with:', { username, appName: APP_CONFIG.name });
      
      // Log before loginOrRegister
      console.log('[Login] Calling loginOrRegister - will create new instance if user does not exist');
      console.log('[Login] Parameters:', { 
        username: username, 
        passwordLength: password.length,
        appName: APP_CONFIG.name 
      });
      
      // Import the enhanced loginOrRegister function and credential storage
      const loginStartTime = Date.now();
      const { loginOrRegisterWithKeys, storeCredentials } = await import('@src/initialization');

      // Check if this is a first-time user (using static import)
      const userExists = await instanceExists(APP_CONFIG.name, username);

      // Show appropriate feedback
      if (!userExists) {
        setLoadingMessage('Creating secure keys (one-time setup)...');
      } else {
        setLoadingMessage('Decrypting stored keys...');
      }

      // The heavy crypto operation (scrypt) only happens for new users
      await loginOrRegisterWithKeys(authenticator, username, password, APP_CONFIG.name);
      console.log(`[PERF] Total login process took: ${Date.now() - loginStartTime}ms`);

      setLoadingMessage('Initializing secure storage...');
      
      console.log('[Login] Login/Registration successful');
      console.log('[Login] Auth state after operation:', authenticator.authState.currentState);
      
      // Store credentials after successful login
      try {
        await storeCredentials(username, password);
        console.log('[Login] Credentials stored successfully');
      } catch (credentialError) {
        console.error('[Login] Failed to store credentials:', credentialError);
        // Don't fail the login if credential storage fails
      }
      
      // Navigation will be handled automatically by auth state change
      // OneProvider will render the app once model is ready
    } catch (err) {
      console.error('[Login] Login failed:', err);
      if (err instanceof Error) {
        console.error('[Login] Error stack:', err.stack);
        setError(err.message);
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[themedStyles.screenContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logoContainer}>
        <AuthLogo fillHeight />
      </View>
      <View style={styles.formContainer}>
        <View style={themedStyles.inputContainer}>
          <Text style={themedStyles.inputLabel}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
            disabled={loading}
            error={!!error}
          />
        </View>

        <View style={themedStyles.inputContainer}>
          <Text style={themedStyles.inputLabel}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            disabled={loading}
            error={!!error}
          />
        </View>

        {error ? (
          <Text style={themedStyles.error}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading || !username || !password}
          style={[themedStyles.buttonPrimary, { marginTop: 16 }]}
        >
          <Text style={themedStyles.buttonPrimaryText}>
            {loading ? 'Logging in...' : 'Login'}
          </Text>
        </TouchableOpacity>

        <Text style={[themedStyles.inputLabel, { marginTop: 12, textAlign: 'center', fontSize: 12, opacity: 0.7 }]}>
          A new account will be created automatically if the username doesn't exist
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logoContainer: {
    flex: 1.2,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 40,
  },
  formContainer: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
});

// Custom TextInput component that matches iOS styling
const TextInput = ({ 
  style, 
  error, 
  ...props 
}: {
  style?: any;
  error?: boolean;
  [key: string]: any;
}) => {
  const { styles: themedStyles } = useAppTheme();
  const theme = useTheme();
  
  return (
    <TextInputRN
      {...props}
      style={[
        themedStyles.input,
        error && { borderBottomColor: theme.colors.error }
      ]}
    />
  );
}; 