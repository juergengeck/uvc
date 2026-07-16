import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useInstance } from '@src/providers/app/useInstance';
import { parseInvitationUrl } from '@src/utils/invitation-url-parser';

/**
 * Hook to handle deep links for invitation URLs
 * This should only be used in authenticated screens
 */
export function useDeepLinks() {
  const router = useRouter();
  const { instance } = useInstance();
  const activeUrls = useRef(new Set<string>());
  const completedUrls = useRef(new Set<string>());

  useEffect(() => {
    if (!instance?.inviteManager) {
      console.log('[useDeepLinks] Instance not ready, skipping deep link setup');
      return;
    }

    const handleUrl = async (url: string) => {
      try {
        // Check if this is an invitation URL
        const parsed = parseInvitationUrl(url);
        
        if (parsed.invitation && !parsed.error) {
          if (activeUrls.current.has(url) || completedUrls.current.has(url)) {
            console.log('[useDeepLinks] Ignoring duplicate invitation URL');
            return;
          }

          activeUrls.current.add(url);
          console.log('[useDeepLinks] Valid invitation URL detected, processing...');
          
          // Navigate to contacts screen to show loading state
          router.push('/(screens)/contacts');
          
          // Process the invitation
          try {
            await instance.inviteManager.acceptInvitationFromUrl(url);
            completedUrls.current.add(url);
            console.log('[useDeepLinks] Invitation accepted successfully');
          } catch (error) {
            console.error('[useDeepLinks] Failed to accept invitation:', error);
            // The error will be shown in the contacts screen
            // We could potentially show a toast or alert here
          } finally {
            activeUrls.current.delete(url);
          }
        } else {
          console.log('[useDeepLinks] Ignoring non-invitation URL');
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
        console.log('[useDeepLinks] App opened from a URL');
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
