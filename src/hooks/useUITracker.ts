import { useInstance } from '@src/providers/app';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects';

export function useUITracker() {
    const { instance } = useInstance();

    const trackInteraction = async (
        elementId: string,
        action: string,
        screenContext?: string,
        metadata?: Record<string, unknown>
    ) => {
        if (!instance) {
            console.warn('[UITracker] No instance available');
            return;
        }

        try {
            const tracker = {
                $type$: 'UITracker',
                elementId,
                action,
                timestamp: Date.now(),
                ...(screenContext && { screenContext }),
                ...(metadata && { metadata })
            };

            await storeUnversionedObject(tracker);
            console.log('[UITracker] Interaction tracked:', tracker);
        } catch (error) {
            console.error('[UITracker] Failed to track interaction:', error);
        }
    };

    return { trackInteraction };
}

export default {
    useUITracker,
};