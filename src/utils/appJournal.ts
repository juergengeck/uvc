/**
 * App Lifecycle Journal Utilities
 * 
 * Provides utilities for logging app lifecycle events to the journal
 */

import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { JournalEntry } from '@OneObjectInterfaces';
import { Platform } from 'react-native';

// App lifecycle event types
export enum AppLifecycleEventType {
  APP_STARTED = 'APP_STARTED',
  APP_STOPPED = 'APP_STOPPED',
  APP_BACKGROUNDED = 'APP_BACKGROUNDED',
  APP_FOREGROUNDED = 'APP_FOREGROUNDED',
  APP_CRASHED = 'APP_CRASHED',
  APP_UPDATED = 'APP_UPDATED'
}

// App usage event types
export enum AppUsageEventType {
  SCREEN_VIEWED = 'SCREEN_VIEWED',
  FEATURE_USED = 'FEATURE_USED',
  ACTION_PERFORMED = 'ACTION_PERFORMED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  SETTING_CHANGED = 'SETTING_CHANGED'
}

interface AppJournalContext {
  channelManager: any;
  journalChannelId: string;
  personId: SHA256IdHash<Person>;
}

let appJournalContext: AppJournalContext | null = null;

/**
 * Initialize the app journal context
 */
export function initializeAppJournal(
  channelManager: any,
  journalChannelId: string,
  personId: SHA256IdHash<Person>
): void {
  appJournalContext = {
    channelManager,
    journalChannelId,
    personId
  };
  console.log('[AppJournal] Initialized with channel:', journalChannelId);
}

/**
 * Get device info for journal entries
 */
function getDeviceInfo() {
  return {
    platform: Platform.OS,
    platformVersion: Platform.Version,
    isTV: Platform.isTV,
    appVersion: '1.0.0', // Should be set from package.json or config
    buildVersion: '1' // Should be set from build config
  };
}

/**
 * Create an app lifecycle journal entry
 */
export async function createAppLifecycleJournalEntry(
  eventType: AppLifecycleEventType,
  data: Record<string, any> = {}
): Promise<void> {
  if (!appJournalContext) {
    console.warn('[AppJournal] Not initialized, skipping lifecycle journal entry');
    return;
  }

  try {
    const entryId = `app-lifecycle-${eventType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const journalEntry: JournalEntry = {
      $type$: 'JournalEntry',
      id: entryId,
      timestamp: Date.now(),
      type: eventType,
      data: {
        ...getDeviceInfo(),
        ...data,
        eventType,
        userId: appJournalContext.personId.toString()
      },
      userId: appJournalContext.personId.toString()
    };
    
    // Store and post to journal channel
    const result = await storeUnversionedObject(journalEntry);
    await appJournalContext.channelManager.postToChannel(
      appJournalContext.journalChannelId,
      result.hash,
      appJournalContext.personId
    );
    
    console.log(`[AppJournal] Created lifecycle journal entry: ${eventType}`);
  } catch (error) {
    console.error('[AppJournal] Error creating lifecycle journal entry:', error);
  }
}

/**
 * Create an app usage journal entry
 */
export async function createAppUsageJournalEntry(
  eventType: AppUsageEventType,
  data: Record<string, any> = {}
): Promise<void> {
  if (!appJournalContext) {
    console.warn('[AppJournal] Not initialized, skipping usage journal entry');
    return;
  }

  try {
    const entryId = `app-usage-${eventType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const journalEntry: JournalEntry = {
      $type$: 'JournalEntry',
      id: entryId,
      timestamp: Date.now(),
      type: eventType,
      data: {
        ...data,
        eventType,
        userId: appJournalContext.personId.toString()
      },
      userId: appJournalContext.personId.toString()
    };
    
    // Store and post to journal channel
    const result = await storeUnversionedObject(journalEntry);
    await appJournalContext.channelManager.postToChannel(
      appJournalContext.journalChannelId,
      result.hash,
      appJournalContext.personId
    );
    
    console.log(`[AppJournal] Created usage journal entry: ${eventType}`);
  } catch (error) {
    console.error('[AppJournal] Error creating usage journal entry:', error);
  }
}

/**
 * Clear the app journal context during logout/reset
 */
export function clearAppJournalContext(): void {
  appJournalContext = undefined;
}

/**
 * Log app start event
 */
export async function logAppStart(startupTime?: number): Promise<void> {
  await createAppLifecycleJournalEntry(AppLifecycleEventType.APP_STARTED, {
    startupTimeMs: startupTime
  });
}

/**
 * Log app stop event
 */
export async function logAppStop(reason?: string): Promise<void> {
  await createAppLifecycleJournalEntry(AppLifecycleEventType.APP_STOPPED, {
    reason: reason || 'user_action',
    sessionDurationMs: Date.now() - appStartTime
  });
}

/**
 * Log app background event
 */
export async function logAppBackground(): Promise<void> {
  await createAppLifecycleJournalEntry(AppLifecycleEventType.APP_BACKGROUNDED, {
    sessionDurationMs: Date.now() - appStartTime
  });
}

/**
 * Log app foreground event
 */
export async function logAppForeground(): Promise<void> {
  await createAppLifecycleJournalEntry(AppLifecycleEventType.APP_FOREGROUNDED, {});
}

/**
 * Log screen view
 */
export async function logScreenView(screenName: string, params?: Record<string, any>): Promise<void> {
  await createAppUsageJournalEntry(AppUsageEventType.SCREEN_VIEWED, {
    screenName,
    params
  });
}

/**
 * Log feature usage
 */
export async function logFeatureUsage(featureName: string, action: string, data?: Record<string, any>): Promise<void> {
  await createAppUsageJournalEntry(AppUsageEventType.FEATURE_USED, {
    featureName,
    action,
    ...data
  });
}

/**
 * Log action performed
 */
export async function logActionPerformed(action: string, target: string, data?: Record<string, any>): Promise<void> {
  await createAppUsageJournalEntry(AppUsageEventType.ACTION_PERFORMED, {
    action,
    target,
    ...data
  });
}

/**
 * Log error
 */
export async function logError(error: Error | string, context?: string): Promise<void> {
  await createAppUsageJournalEntry(AppUsageEventType.ERROR_OCCURRED, {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    context
  });
}

/**
 * Log setting change
 */
export async function logSettingChange(settingName: string, oldValue: any, newValue: any): Promise<void> {
  await createAppUsageJournalEntry(AppUsageEventType.SETTING_CHANGED, {
    settingName,
    oldValue,
    newValue
  });
}

// Track app start time for session duration
let appStartTime = Date.now();