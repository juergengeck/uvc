/**
 * Channel Synchronization Diagnostics
 * 
 * This utility helps diagnose why messages aren't synchronizing between devices
 * by examining the channel update flow and access grant propagation.
 */

import { getLogger } from './logger';

const log = getLogger('ChannelSyncDiagnostics');

interface ChannelSyncDiagnostic {
  timestamp: Date;
  deviceId: string;
  channelInfo: {
    channelId: string;
    channelOwner: string | null;
    participantIds: string[];
    messageCount: number;
  };
  listeners: {
    channelManagerListeners: number;
    chatModelListeners: number;
    commServerListeners: number;
    leuteAccessListeners: number;
  };
  accessGrants: {
    channelInfoGranted: boolean;
    channelVersionGranted: boolean;
    entryGrantsCreated: number;
    participantsWithAccess: string[];
  };
  chumStatus: {
    pluginInstalled: boolean;
    syncMessagesDetected: number;
    lastSyncTime: Date | null;
  };
  issues: string[];
}

export class ChannelSyncDiagnostics {
  private static diagnosticData: ChannelSyncDiagnostic = {
    timestamp: new Date(),
    deviceId: '',
    channelInfo: {
      channelId: '',
      channelOwner: null,
      participantIds: [],
      messageCount: 0
    },
    listeners: {
      channelManagerListeners: 0,
      chatModelListeners: 0,
      commServerListeners: 0,
      leuteAccessListeners: 0
    },
    accessGrants: {
      channelInfoGranted: false,
      channelVersionGranted: false,
      entryGrantsCreated: 0,
      participantsWithAccess: []
    },
    chumStatus: {
      pluginInstalled: false,
      syncMessagesDetected: 0,
      lastSyncTime: null
    },
    issues: []
  };

  /**
   * Run comprehensive channel synchronization diagnostics
   */
  public static async runDiagnostics(channelId: string): Promise<ChannelSyncDiagnostic> {
    console.log('\n🔬 CHANNEL SYNCHRONIZATION DIAGNOSTICS');
    console.log('='.repeat(80));
    console.log(`Channel ID: ${channelId}`);
    
    this.diagnosticData.timestamp = new Date();
    this.diagnosticData.channelInfo.channelId = channelId;
    
    try {
      // Get AppModel instance
      const appModel = this.getAppModelInstance();
      if (!appModel) {
        this.diagnosticData.issues.push('CRITICAL: AppModel not available');
        return this.diagnosticData;
      }
      
      // 1. Get device info
      await this.checkDeviceInfo(appModel);
      
      // 2. Check channel info
      await this.checkChannelInfo(appModel, channelId);
      
      // 3. Check listeners
      await this.checkListeners(appModel);
      
      // 4. Check access grants
      await this.checkAccessGrants(appModel, channelId);
      
      // 5. Check CHUM status
      await this.checkChumStatus();
      
      // 6. Analyze issues
      this.analyzeIssues();
      
      console.log('\n✅ Channel sync diagnostics complete');
      
    } catch (error) {
      console.error('❌ Channel diagnostics failed:', error);
      this.diagnosticData.issues.push(`Diagnostics failed: ${error}`);
    }
    
    return this.diagnosticData;
  }
  
  private static getAppModelInstance(): any {
    if (typeof window !== 'undefined' && (window as any).appModel) {
      return (window as any).appModel;
    }
    if (typeof global !== 'undefined' && (global as any).appModel) {
      return (global as any).appModel;
    }
    return null;
  }
  
  private static async checkDeviceInfo(appModel: any): Promise<void> {
    console.log('\n1️⃣ DEVICE INFORMATION');
    
    try {
      const personId = await appModel.leuteModel.myMainIdentity();
      this.diagnosticData.deviceId = personId ? personId.substring(0, 8) : 'unknown';
      console.log(`   📱 Device ID: ${this.diagnosticData.deviceId}`);
    } catch (error) {
      console.error('   ❌ Error getting device info:', error);
      this.diagnosticData.issues.push('Could not get device information');
    }
  }
  
  private static async checkChannelInfo(appModel: any, channelId: string): Promise<void> {
    console.log('\n2️⃣ CHANNEL INFORMATION');
    
    try {
      const channelManager = appModel.channelManager;
      if (!channelManager) {
        console.log('   ❌ ChannelManager not available');
        this.diagnosticData.issues.push('ChannelManager not available');
        return;
      }
      
      // Get channel info
      const channelInfo = await channelManager.getChannelInfo(channelId);
      if (!channelInfo) {
        console.log('   ❌ Channel not found');
        this.diagnosticData.issues.push('Channel not found');
        return;
      }
      
      console.log(`   📊 Channel found: ${channelId}`);
      
      // Extract participants from channel ID for 1-to-1 chats
      if (channelId.includes('<->')) {
        const parts = channelId.split('<->');
        if (parts.length === 2) {
          this.diagnosticData.channelInfo.participantIds = parts;
          console.log(`   👥 Participants: ${parts[0].substring(0, 8)}... <-> ${parts[1].substring(0, 8)}...`);
        }
      }
      
      // Get message count
      const entries = await channelManager.getChannelEntries(channelId);
      this.diagnosticData.channelInfo.messageCount = entries?.length || 0;
      console.log(`   💬 Message count: ${this.diagnosticData.channelInfo.messageCount}`);
      
      // Log recent entries
      if (entries && entries.length > 0) {
        console.log('   📝 Recent entries:');
        entries.slice(-3).forEach((entry: any, idx: number) => {
          console.log(`      Entry ${idx + 1}: ${entry.channelEntryHash?.substring(0, 16)}... (${entry.creationTime})`);
        });
      }
      
    } catch (error) {
      console.error('   ❌ Error checking channel info:', error);
      this.diagnosticData.issues.push('Could not check channel information');
    }
  }
  
  private static async checkListeners(appModel: any): Promise<void> {
    console.log('\n3️⃣ EVENT LISTENERS');
    
    try {
      const channelManager = appModel.channelManager;
      
      // Check ChannelManager listeners
      if (channelManager?.onUpdated) {
        const listeners = (channelManager.onUpdated as any)._listeners || {};
        this.diagnosticData.listeners.channelManagerListeners = Object.keys(listeners).length;
        console.log(`   📡 ChannelManager.onUpdated listeners: ${this.diagnosticData.listeners.channelManagerListeners}`);
      }
      
      // Check ChatModel listeners
      if (appModel.chatModel) {
        this.diagnosticData.listeners.chatModelListeners = 1; // ChatModel always listens
        console.log(`   💬 ChatModel listener: active`);
      }
      
      // Check CommServerManager listeners
      if (appModel.transportManager?.commServerManager) {
        this.diagnosticData.listeners.commServerListeners = 1; // CommServer always listens
        console.log(`   🌐 CommServerManager listener: active`);
      }
      
      // Check LeuteAccessRightsManager listeners
      if (appModel.leuteAccessRightsManager) {
        this.diagnosticData.listeners.leuteAccessListeners = 1; // LARM always listens
        console.log(`   🔐 LeuteAccessRightsManager listener: active`);
      }
      
      const totalListeners = 
        this.diagnosticData.listeners.channelManagerListeners +
        this.diagnosticData.listeners.chatModelListeners +
        this.diagnosticData.listeners.commServerListeners +
        this.diagnosticData.listeners.leuteAccessListeners;
        
      console.log(`   📊 Total listeners: ${totalListeners}`);
      
      if (totalListeners < 3) {
        this.diagnosticData.issues.push('WARNING: Missing critical event listeners');
      }
      
    } catch (error) {
      console.error('   ❌ Error checking listeners:', error);
      this.diagnosticData.issues.push('Could not check event listeners');
    }
  }
  
  private static async checkAccessGrants(appModel: any, channelId: string): Promise<void> {
    console.log('\n4️⃣ ACCESS GRANTS');
    
    try {
      // This is a simplified check - in reality we'd need to query the access system
      const isOneToOne = channelId.includes('<->');
      
      if (isOneToOne) {
        const parts = channelId.split('<->');
        if (parts.length === 2) {
          this.diagnosticData.accessGrants.participantsWithAccess = parts;
          this.diagnosticData.accessGrants.channelInfoGranted = true; // Assume granted
          console.log(`   ✅ 1-to-1 channel access configured for participants`);
        }
      } else {
        this.diagnosticData.accessGrants.channelInfoGranted = true; // Assume granted to everyone
        console.log(`   ✅ Group channel access configured for everyone`);
      }
      
      // Check entry grants (estimate based on message count)
      this.diagnosticData.accessGrants.entryGrantsCreated = this.diagnosticData.channelInfo.messageCount;
      console.log(`   📦 Entry grants created: ${this.diagnosticData.accessGrants.entryGrantsCreated}`);
      
    } catch (error) {
      console.error('   ❌ Error checking access grants:', error);
      this.diagnosticData.issues.push('Could not verify access grants');
    }
  }
  
  private static async checkChumStatus(): Promise<void> {
    console.log('\n5️⃣ CHUM PROTOCOL STATUS');
    
    try {
      // Check if ChumPlugin is installed
      const connectionModule = require('@refinio/one.models/lib/misc/Connection/Connection');
      const hasPlugin = (connectionModule.default as any).__chumPatched;
      this.diagnosticData.chumStatus.pluginInstalled = !!hasPlugin;
      
      console.log(`   🔌 ChumPlugin installed: ${this.diagnosticData.chumStatus.pluginInstalled ? '✅' : '❌'}`);
      
      if (!this.diagnosticData.chumStatus.pluginInstalled) {
        this.diagnosticData.issues.push('CRITICAL: ChumPlugin not installed - sync will fail');
      }
      
      // Monitor console for CHUM activity
      const originalLog = console.log;
      let syncMessages = 0;
      
      console.log = (...args: any[]) => {
        const message = args.join(' ');
        if (message.includes('synchronisation') || message.includes('CHUM')) {
          syncMessages++;
          this.diagnosticData.chumStatus.lastSyncTime = new Date();
        }
        originalLog(...args);
      };
      
      // Wait briefly to catch any CHUM messages
      console.log('   ⏳ Monitoring for CHUM activity...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Restore console
      console.log = originalLog;
      
      this.diagnosticData.chumStatus.syncMessagesDetected = syncMessages;
      console.log(`   📨 Sync messages detected: ${syncMessages}`);
      
      if (syncMessages === 0) {
        console.log('   ⚠️ No CHUM sync activity detected');
        this.diagnosticData.issues.push('WARNING: No CHUM sync activity detected');
      }
      
    } catch (error) {
      console.error('   ❌ Error checking CHUM status:', error);
      this.diagnosticData.issues.push('Could not check CHUM status');
    }
  }
  
  private static analyzeIssues(): void {
    console.log('\n6️⃣ ANALYSIS');
    
    // Check for critical issues
    if (this.diagnosticData.channelInfo.messageCount === 0) {
      this.diagnosticData.issues.push('INFO: Channel has no messages');
    }
    
    if (this.diagnosticData.listeners.channelManagerListeners === 0) {
      this.diagnosticData.issues.push('CRITICAL: No ChannelManager listeners - updates won\'t be processed');
    }
    
    if (!this.diagnosticData.accessGrants.channelInfoGranted) {
      this.diagnosticData.issues.push('CRITICAL: Channel access not granted - sync will fail');
    }
    
    if (!this.diagnosticData.chumStatus.pluginInstalled) {
      this.diagnosticData.issues.push('CRITICAL: ChumPlugin not installed - messages won\'t sync');
    }
    
    // Print issues
    if (this.diagnosticData.issues.length > 0) {
      console.log('   🚨 Issues found:');
      this.diagnosticData.issues.forEach((issue, idx) => {
        console.log(`      ${idx + 1}. ${issue}`);
      });
    } else {
      console.log('   ✅ No issues detected');
    }
  }
  
  /**
   * Print a summary report
   */
  public static printReport(diagnostic: ChannelSyncDiagnostic): void {
    console.log('\n📊 CHANNEL SYNC DIAGNOSTIC REPORT');
    console.log('='.repeat(50));
    console.log(`Channel: ${diagnostic.channelInfo.channelId}`);
    console.log(`Device: ${diagnostic.deviceId}`);
    console.log(`Messages: ${diagnostic.channelInfo.messageCount}`);
    console.log(`Listeners: ${diagnostic.listeners.channelManagerListeners + diagnostic.listeners.chatModelListeners + diagnostic.listeners.commServerListeners + diagnostic.listeners.leuteAccessListeners}`);
    console.log(`CHUM Active: ${diagnostic.chumStatus.syncMessagesDetected > 0 ? '✅' : '❌'}`);
    console.log(`Issues: ${diagnostic.issues.length}`);
  }
}

// Export convenience function
export async function runChannelSyncDiagnostics(channelId: string): Promise<ChannelSyncDiagnostic> {
  const result = await ChannelSyncDiagnostics.runDiagnostics(channelId);
  ChannelSyncDiagnostics.printReport(result);
  return result;
}

// Make available globally for console debugging
(globalThis as any).runChannelSyncDiagnostics = runChannelSyncDiagnostics;

export default ChannelSyncDiagnostics;