import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams, Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

/**
 * Catch-all handler for any chat routes that aren't explicitly defined
 * This component redirects to the appropriate route or shows an error
 */
export default function ChatCatchAll() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [redirectPath, setRedirectPath] = React.useState<string>('/(screens)/chat'); // Default path
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  useEffect(() => {
    // Parse the rest parameter to determine where to redirect
    const rest = params.rest;
    console.log('[ChatCatchAll] Caught unmatched route:', rest);
    
    if (!rest || typeof rest !== 'string') {
      // Default to chat index
      setLoading(false);
      return; // Keep default path
    }
    
    // Split by slashes to handle nested paths
    const segments = Array.isArray(rest) ? rest : rest.split('/');
    
    if (segments.length === 0) {
      // Default to chat index
      setLoading(false);
      return; // Keep default path
    }
    
    // Handle specific cases
    const firstSegment = segments[0];
    
    if (firstSegment === 'new') {
      setRedirectPath('/(screens)/chat/new');
    } else if (firstSegment.match(/^[a-zA-Z0-9_-]+$/)) {
      // Looks like a topic ID - treat as a dynamic route
      setRedirectPath(`/(screens)/chat/${firstSegment}`);
    } else {
      // Unrecognized path
      setError(`Invalid chat route: ${rest}`);
    }
    
    setLoading(false);
  }, [params.rest]);
  
  // Show a brief loading state while we determine the redirect path
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" />
        <Text style={styles.text}>{t('common.status.redirecting')}</Text>
      </View>
    );
  }
  
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <Text 
          style={styles.link} 
          onPress={() => router.push('/(screens)/chat')}
        >
          {t('common.actions.backToChat', { defaultValue: 'Back to Chat' })}
        </Text>
      </View>
    );
  }
  
  // Redirect to the appropriate path
  return <Redirect href={redirectPath} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  text: {
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#d32f2f',
    marginBottom: 16,
    textAlign: 'center',
  },
  link: {
    color: '#2196F3',
    textDecorationLine: 'underline',
    marginTop: 16,
  },
}); 