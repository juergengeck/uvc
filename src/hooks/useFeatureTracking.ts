/**
 * Hook for tracking feature usage and logging to journal
 */

import { useCallback } from 'react';
import { logFeatureUsage, logActionPerformed, logError } from '../utils/appJournal';

export function useFeatureTracking(featureName: string) {
  const trackAction = useCallback(async (action: string, data?: Record<string, any>) => {
    try {
      await logFeatureUsage(featureName, action, data);
      console.log(`[useFeatureTracking] Tracked: ${featureName}.${action}`, data);
    } catch (error) {
      console.error('[useFeatureTracking] Error tracking feature usage:', error);
    }
  }, [featureName]);
  
  const trackActionPerformed = useCallback(async (action: string, target: string, data?: Record<string, any>) => {
    try {
      await logActionPerformed(action, target, { feature: featureName, ...data });
      console.log(`[useFeatureTracking] Action tracked: ${action} on ${target}`, data);
    } catch (error) {
      console.error('[useFeatureTracking] Error tracking action:', error);
    }
  }, [featureName]);
  
  const trackError = useCallback(async (error: Error | string, context?: string) => {
    try {
      await logError(error, `${featureName}${context ? `: ${context}` : ''}`);
      console.error(`[useFeatureTracking] Error tracked in ${featureName}:`, error);
    } catch (trackingError) {
      console.error('[useFeatureTracking] Error tracking error:', trackingError);
    }
  }, [featureName]);
  
  return {
    trackAction,
    trackActionPerformed,
    trackError
  };
}