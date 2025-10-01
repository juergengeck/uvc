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

// Journal queue for background processing
interface QueuedJournalEntry {
  type: 'lifecycle' | 'usage';
  eventType: string;
  data: Record<string, any>;
  timestamp: number;
}

const journalQueue: QueuedJournalEntry[] = [];
let isProcessingQueue = false;

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
 * Process the journal queue in background
 */
async function processJournalQueue(): Promise<void> {
  if (isProcessingQueue || journalQueue.length === 0 || !appJournalContext) {
    return;
  }

  isProcessingQueue = true;

  try {
    while (journalQueue.length > 0) {
      const queuedEntry = journalQueue.shift()!;

      try {
        const entryId = `app-${queuedEntry.type}-${queuedEntry.eventType.toLowerCase()}-${queuedEntry.timestamp}-${Math.random().toString(36).substr(2, 9)}`;
        const journalEntry: JournalEntry = {
          $type$: 'JournalEntry',
          id: entryId,
          timestamp: queuedEntry.timestamp,
          type: queuedEntry.eventType,
          data: {
            ...(queuedEntry.type === 'lifecycle' ? getDeviceInfo() : {}),
            ...queuedEntry.data,
            eventType: queuedEntry.eventType,
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

        // console.log(`[AppJournal] Processed queued journal entry: ${queuedEntry.eventType}`);
      } catch (error) {
        console.error('[AppJournal] Error processing queued journal entry:', error);
        // Continue processing other entries even if one fails
      }

      // Small delay between processing entries to avoid blocking the main thread
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } catch (error) {
    console.error('[AppJournal] Error in queue processing:', error);
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Add entry to journal queue for background processing
 */
function queueJournalEntry(
  type: 'lifecycle' | 'usage',
  eventType: string,
  data: Record<string, any>
): void {
  if (!appJournalContext) {
    console.warn('[AppJournal] Not initialized, skipping journal entry');
    return;
  }

  // Add to queue
  journalQueue.push({
    type,
    eventType,
    data,
    timestamp: Date.now()
  });

  // Start processing queue in background
  setTimeout(() => processJournalQueue(), 0);
}

/**
 * Create an app lifecycle journal entry
 */
export async function createAppLifecycleJournalEntry(
  eventType: AppLifecycleEventType,
  data: Record<string, any> = {}
): Promise<void> {
  queueJournalEntry('lifecycle', eventType, data);
}

/**
 * Create an app usage journal entry
 */
export async function createAppUsageJournalEntry(
  eventType: AppUsageEventType,
  data: Record<string, any> = {}
): Promise<void> {
  queueJournalEntry('usage', eventType, data);
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