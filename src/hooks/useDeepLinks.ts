import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppModel } from './useAppModel';
import { parseInvitationUrl } from '@src/utils/invitation-url-parser';

/**
 * Hook to handle deep links for invitation URLs
 * This should only be used in authenticated screens
 */
export function useDeepLinks() {
  const router = useRouter();
  const { instance } = useAppModel();

  useEffect(() => {
    if (!instance?.inviteManager) {
      console.log('[useDeepLinks] Instance not ready, skipping deep link setup');
      return;
    }

    const handleUrl = async (url: string) => {
      console.log('[useDeepLinks] Received URL:', url);
      
      try {
        // Check if this is an invitation URL
        const parsed = parseInvitationUrl(url);
        
        if (parsed.invitation && !parsed.error) {
          console.log('[useDeepLinks] Valid invitation URL detected, processing...');
          
          // Navigate to contacts screen to show loading state
          router.push('/(screens)/contacts');
          
          // Process the invitation
          try {
            await instance.inviteManager.acceptInvitationFromUrl(url);
            console.log('[useDeepLinks] Invitation accepted successfully');
          } catch (error) {
            console.error('[useDeepLinks] Failed to accept invitation:', error);
            // The error will be shown in the contacts screen
            // We could potentially show a toast or alert here
          }
        } else {
          console.log('[useDeepLinks] Not an invitation URL or parse error:', parsed.error);
        }
      } catch (error) {
        console.error('[useDeepLinks] Error handling URL:', error);
      }
    };

    // Handle URL when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    // Handle URL when app was opened by the URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[useDeepLinks] App opened with URL:', url);
        handleUrl(url);
      }
    }).catch((error) => {
      console.error('[useDeepLinks] Error getting initial URL:', error);
    });

    return () => {
      subscription.remove();
    };
  }, [instance, router]);
}