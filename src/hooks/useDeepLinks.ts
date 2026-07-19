import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppModel } from '@src/providers/app/AppModelProvider';
import { parseInvitationUrl } from '@src/utils/invitation-url-parser';
import {
  parseUvcIntegrationControlUrl,
  runUvcIntegrationControlAction,
} from '@src/services/UvcIntegrationTestBridge';

/**
 * Hook to handle deep links for invitation URLs
 * This should only be used in authenticated screens
 */
export function useDeepLinks() {
  const router = useRouter();
  const { model: instance } = useAppModel();
  const activeUrls = useRef(new Set<string>());
  const completedUrls = useRef(new Set<string>());

  useEffect(() => {
    if (!instance) {
      console.log('[useDeepLinks] Instance not ready, skipping deep link setup');
      return;
    }

    const handleUrl = async (url: string) => {
      try {
        if (process.env.EXPO_PUBLIC_UVC_INTEGRATION === '1') {
          const action = parseUvcIntegrationControlUrl(
            url,
            process.env.EXPO_PUBLIC_UVC_E2E_SECRET ?? '',
          );
          if (action) {
            if (activeUrls.current.has(url) || completedUrls.current.has(url)) {
              console.log('[UvcIntegrationBridge] Ignoring duplicate control action');
              return;
            }
            if (!instance.deviceControlModel) {
              throw new Error('[UvcIntegrationBridge] DeviceControlModel is not ready');
            }
            activeUrls.current.add(url);
            try {
              console.log(`[UvcIntegrationBridge] Running ${action.actionId}`);
              await runUvcIntegrationControlAction(instance.deviceControlModel, action);
              completedUrls.current.add(url);
              console.log(`[UvcIntegrationBridge] Completed ${action.actionId}`);
            } finally {
              activeUrls.current.delete(url);
            }
            return;
          }
        }

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
            if (!instance.inviteManager) {
              throw new Error('[useDeepLinks] InviteManager is not ready');
            }
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
