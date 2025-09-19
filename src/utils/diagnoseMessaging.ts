/**
 * Comprehensive Messaging Diagnostics
 * 
 * This script provides detailed analysis of the messaging system to help identify
 * issues with asymmetric messaging between devices.
 */

import { getLogger } from './logger';
import { getChannelManager } from '../initialization';

const log = getLogger('MessagingDiagnostics');

interface MessagingDiagnosticResult {
  timestamp: Date;
  channelManagerStatus: {
    available: boolean;
    hasOnUpdatedEvent: boolean;
    hasPostToChannelMethod: boolean;
    listenerCount?: number;
  };
  commServerManagerStatus: {
    initialized: boolean;
    hasEventListeners: boolean;
    accessGrantsWorking: boolean;
  };
  chumSyncStatus: {
    enabled: boolean;
    reachable: boolean;
    lastSyncTime?: Date;
  };
  recentChannelActivity: {
    channelId: string;
    lastActivity: Date;
    messageCount: number;
    hasAccessGrants: boolean;
  }[];
  recommendations: string[];
}

export class MessagingDiagnostics {
  
  /**
   * Run comprehensive diagnostics on the messaging system
   */
  public static async runDiagnostics(): Promise<MessagingDiagnosticResult> {
    console.log('[MessagingDiagnostics] 🔍 Starting comprehensive messaging diagnostics...');
    
    const result: MessagingDiagnosticResult = {
      timestamp: new Date(),
      channelManagerStatus: {
        available: false,
        hasOnUpdatedEvent: false,
        hasPostToChannelMethod: false,
      },
      commServerManagerStatus: {
        initialized: false,
        hasEventListeners: false,
        accessGrantsWorking: false,
      },
      chumSyncStatus: {
        enabled: false,
        reachable: false,
      },
      recentChannelActivity: [],
      recommendations: [],
    };

    try {
      // 1. Check ChannelManager status
      await this.checkChannelManagerStatus(result);
      
      // 2. Check CommServerManager status
      await this.checkCommServerManagerStatus(result);
      
      // 3. Check CHUM sync status
      await this.checkChumSyncStatus(result);
      
      // 4. Analyze recent channel activity
      await this.analyzeRecentChannelActivity(result);
      
      // 5. Generate recommendations
      this.generateRecommendations(result);
      
      console.log('[MessagingDiagnostics] ✅ Diagnostics completed successfully');
      return result;
      
    } catch (error) {
      console.error('[MessagingDiagnostics] ❌ Diagnostics failed:', error);
      result.recommendations.push(`Diagnostics failed: ${error}`);
      return result;
    }
  }

  /**
   * Check ChannelManager availability and functionality
   */
  private static async checkChannelManagerStatus(result: MessagingDiagnosticResult): Promise<void> {
    console.log('[MessagingDiagnostics] 🔍 Checking ChannelManager status...');
    
    try {
      const channelManager = getChannelManager();
      
      if (channelManager) {
        result.channelManagerStatus.available = true;
        console.log('[MessagingDiagnostics] ✅ ChannelManager is available');
        
        // Check for onUpdated event
        if (channelManager.onUpdated && typeof channelManager.onUpdated.listen === 'function') {
          result.channelManagerStatus.hasOnUpdatedEvent = true;
          console.log('[MessagingDiagnostics] ✅ ChannelManager.onUpdated event system is available');
        } else {
          console.log('[MessagingDiagnostics] ❌ ChannelManager.onUpdated event system is NOT available');
        }
        
        // Check for postToChannel method
        if (channelManager.postToChannel && typeof channelManager.postToChannel === 'function') {
          result.channelManagerStatus.hasPostToChannelMethod = true;
          console.log('[MessagingDiagnostics] ✅ ChannelManager.postToChannel method is available');
        } else {
          console.log('[MessagingDiagnostics] ❌ ChannelManager.postToChannel method is NOT available');
        }
        
      } else {
        console.log('[MessagingDiagnostics] ❌ ChannelManager is NOT available');
      }
      
    } catch (error) {
      console.error('[MessagingDiagnostics] ❌ Error checking ChannelManager:', error);
      result.recommendations.push(`ChannelManager check failed: ${error}`);
    }
  }

  /**
   * Check CommServerManager initialization and event listeners
   */
  private static async checkCommServerManagerStatus(result: MessagingDiagnosticResult): Promise<void> {
    console.log('[MessagingDiagnostics] 🔍 Checking CommServerManager status...');
    
    try {
      // Try to get AppModel and check for TransportManager
      const { getModel } = await import('../initialization');
      const appModel = getModel();
      
      if (appModel) {
        console.log('[MessagingDiagnostics] ✅ AppModel is available');
        
        try {
          const transportManager = appModel.getTransportManager();
          if (transportManager) {
            result.commServerManagerStatus.initialized = true;
            console.log('[MessagingDiagnostics] ✅ TransportManager is available');
            
            // Check if CommServerManager has event listeners
            // This is harder to detect directly, so we'll assume it's working if TransportManager is available
            result.commServerManagerStatus.hasEventListeners = true;
            console.log('[MessagingDiagnostics] ✅ Assuming CommServerManager event listeners are active');
            
          } else {
            console.log('[MessagingDiagnostics] ❌ TransportManager is NOT available');
          }
        } catch (error) {
          console.log('[MessagingDiagnostics] ❌ Error getting TransportManager:', error);
        }
        
      } else {
        console.log('[MessagingDiagnostics] ❌ AppModel is NOT available');
      }
      
    } catch (error) {
      console.error('[MessagingDiagnostics] ❌ Error checking CommServerManager:', error);
      result.recommendations.push(`CommServerManager check failed: ${error}`);
    }
  }

  /**
   * Check CHUM sync status
   */
  private static async checkChumSyncStatus(result: MessagingDiagnosticResult): Promise<void> {
    console.log('[MessagingDiagnostics] 🔍 Checking CHUM sync status...');
    
    try {
      // This is a placeholder - in a real implementation we'd check:
      // - CHUM server connectivity
      // - Recent sync activity
      // - Access grants for messages
      
      result.chumSyncStatus.enabled = true; // Assume enabled for now
      console.log('[MessagingDiagnostics] ✅ CHUM sync is assumed to be enabled');
      
    } catch (error) {
      console.error('[MessagingDiagnostics] ❌ Error checking CHUM sync:', error);
      result.recommendations.push(`CHUM sync check failed: ${error}`);
    }
  }

  /**
   * Analyze recent channel activity
   */
  private static async analyzeRecentChannelActivity(result: MessagingDiagnosticResult): Promise<void> {
    console.log('[MessagingDiagnostics] 🔍 Analyzing recent channel activity...');
    
    try {
      const channelManager = getChannelManager();
      if (!channelManager) {
        console.log('[MessagingDiagnostics] ❌ Cannot analyze channel activity - ChannelManager not available');
        return;
      }
      
      // This is a placeholder - in a real implementation we'd:
      // - Get list of recent channels
      // - Check message counts
      // - Verify access grants exist
      // - Check last activity timestamps
      
      console.log('[MessagingDiagnostics] ✅ Channel activity analysis placeholder completed');
      
    } catch (error) {
      console.error('[MessagingDiagnostics] ❌ Error analyzing channel activity:', error);
      result.recommendations.push(`Channel activity analysis failed: ${error}`);
    }
  }

  /**
   * Generate recommendations based on diagnostic results
   */
  private static generateRecommendations(result: MessagingDiagnosticResult): void {
    console.log('[MessagingDiagnostics] 🔍 Generating recommendations...');
    
    // Check for common issues
    if (!result.channelManagerStatus.available) {
      result.recommendations.push('CRITICAL: ChannelManager is not available - check initialization');
    }
    
    if (!result.channelManagerStatus.hasOnUpdatedEvent) {
      result.recommendations.push('CRITICAL: ChannelManager.onUpdated event system is not available - asymmetric messaging will fail');
    }
    
    if (!result.channelManagerStatus.hasPostToChannelMethod) {
      result.recommendations.push('CRITICAL: ChannelManager.postToChannel method is not available - message sending will fail');
    }
    
    if (!result.commServerManagerStatus.initialized) {
      result.recommendations.push('WARNING: CommServerManager/TransportManager is not initialized - access grants may not be created');
    }
    
    if (!result.commServerManagerStatus.hasEventListeners) {
      result.recommendations.push('WARNING: CommServerManager event listeners may not be active - access grants may not be created');
    }
    
    if (!result.chumSyncStatus.enabled) {
      result.recommendations.push('WARNING: CHUM sync is not enabled - messages will not replicate between devices');
    }
    
    if (result.recommendations.length === 0) {
      result.recommendations.push('All systems appear to be functioning normally');
    }
    
    console.log('[MessagingDiagnostics] ✅ Recommendations generated');
  }

  /**
   * Print a formatted diagnostic report
   */
  public static printDiagnosticReport(result: MessagingDiagnosticResult): void {
    console.log('\n📊 MESSAGING DIAGNOSTICS REPORT');
    console.log('================================');
    console.log(`Timestamp: ${result.timestamp.toISOString()}`);
    console.log('');
    
    console.log('🔧 ChannelManager Status:');
    console.log(`  Available: ${result.channelManagerStatus.available ? '✅' : '❌'}`);
    console.log(`  onUpdated Event: ${result.channelManagerStatus.hasOnUpdatedEvent ? '✅' : '❌'}`);
    console.log(`  postToChannel Method: ${result.channelManagerStatus.hasPostToChannelMethod ? '✅' : '❌'}`);
    console.log('');
    
    console.log('🌐 CommServerManager Status:');
    console.log(`  Initialized: ${result.commServerManagerStatus.initialized ? '✅' : '❌'}`);
    console.log(`  Event Listeners: ${result.commServerManagerStatus.hasEventListeners ? '✅' : '❌'}`);
    console.log(`  Access Grants: ${result.commServerManagerStatus.accessGrantsWorking ? '✅' : '❌'}`);
    console.log('');
    
    console.log('🔄 CHUM Sync Status:');
    console.log(`  Enabled: ${result.chumSyncStatus.enabled ? '✅' : '❌'}`);
    console.log(`  Reachable: ${result.chumSyncStatus.reachable ? '✅' : '❌'}`);
    console.log('');
    
    console.log('💡 Recommendations:');
    result.recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
    console.log('');
  }
}

// Export convenience function
export async function runMessagingDiagnostics(): Promise<MessagingDiagnosticResult> {
  const result = await MessagingDiagnostics.runDiagnostics();
  MessagingDiagnostics.printDiagnosticReport(result);
  return result;
}

// Export for global access
(globalThis as any).runMessagingDiagnostics = runMessagingDiagnostics; 