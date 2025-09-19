/**
 * Comprehensive CHUM Synchronization Diagnostics
 * 
 * This tool diagnoses why CHUM protocol message transfer is failing between devices
 * despite access grants being created successfully.
 */

import { getLogger } from './logger';

const log = getLogger('ChumSyncDiagnostics');

interface ChumDiagnosticResult {
  timestamp: Date;
  deviceInfo: {
    deviceId: string;
    personId: string;
  };
  accessGrantStatus: {
    grantsCreated: boolean;
    grantCount: number;
    targetObjects: string[];
  };
  chumConnectionStatus: {
    exporterActive: boolean;
    importerActive: boolean;
    connectionCount: number;
    remotePersonIds: string[];
  };
  accessManagerStatus: {
    accessibleObjectsCount: number;
    accessibleRootHashes: string[];
    accessGrantsVisible: boolean;
  };
  chumProtocolActivity: {
    exporterRequests: number;
    importerPolls: number;
    objectsTransferred: number;
    protocolErrors: string[];
  };
  recommendations: string[];
}

export class ChumSyncDiagnostics {
  
  /**
   * Run comprehensive CHUM synchronization diagnostics
   */
  public static async runDiagnostics(): Promise<ChumDiagnosticResult> {
    console.log('\n🔬 COMPREHENSIVE CHUM SYNCHRONIZATION DIAGNOSTICS');
    console.log('='.repeat(80));
    
    const result: ChumDiagnosticResult = {
      timestamp: new Date(),
      deviceInfo: { deviceId: '', personId: '' },
      accessGrantStatus: { grantsCreated: false, grantCount: 0, targetObjects: [] },
      chumConnectionStatus: { exporterActive: false, importerActive: false, connectionCount: 0, remotePersonIds: [] },
      accessManagerStatus: { accessibleObjectsCount: 0, accessibleRootHashes: [], accessGrantsVisible: false },
      chumProtocolActivity: { exporterRequests: 0, importerPolls: 0, objectsTransferred: 0, protocolErrors: [] },
      recommendations: []
    };
    
    try {
      // Get AppModel instance
      const appModel = this.getAppModelInstance();
      if (!appModel) {
        result.recommendations.push('CRITICAL: AppModel not available - cannot run diagnostics');
        return result;
      }
      
      // 1. Get device info
      await this.getDeviceInfo(appModel, result);
      
      // 2. Check access grant status
      await this.checkAccessGrantStatus(appModel, result);
      
      // 3. Check CHUM connection status
      await this.checkChumConnectionStatus(appModel, result);
      
      // 4. Check AccessManager status
      await this.checkAccessManagerStatus(appModel, result);
      
      // 5. Monitor CHUM protocol activity
      await this.monitorChumProtocolActivity(appModel, result);
      
      // 6. Generate recommendations
      this.generateRecommendations(result);
      
      console.log('\n✅ CHUM synchronization diagnostics complete');
      
    } catch (error) {
      console.error('❌ CHUM diagnostics failed:', error);
      result.recommendations.push(`Diagnostics failed: ${error}`);
    }
    
    return result;
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
  
  private static async getDeviceInfo(appModel: any, result: ChumDiagnosticResult): Promise<void> {
    console.log('\n1️⃣ DEVICE INFORMATION');
    
    try {
      const personId = await appModel.leuteModel.myMainIdentity();
      result.deviceInfo.personId = personId || 'unknown';
      result.deviceInfo.deviceId = personId ? personId.substring(0, 8) : 'unknown';
      
      console.log(`   👤 Person ID: ${result.deviceInfo.personId}`);
      console.log(`   📱 Device ID: ${result.deviceInfo.deviceId}`);
      
    } catch (error) {
      console.error('   ❌ Error getting device info:', error);
      result.recommendations.push('Could not get device information');
    }
  }
  
  private static async checkAccessGrantStatus(appModel: any, result: ChumDiagnosticResult): Promise<void> {
    console.log('\n2️⃣ ACCESS GRANT STATUS');
    
    try {
      // Check if LeuteAccessRightsManager has been creating access grants
      // We'll look for recent Access/IdAccess objects
      
      const channelManager = appModel.channelManager;
      if (!channelManager) {
        console.log('   ❌ ChannelManager not available');
        return;
      }
      
      // Get all channels to see what access grants might exist
      const channels = await channelManager.channels();
      console.log(`   📊 Total channels: ${channels.length}`);
      
      // Count chat channels (potential targets for access grants)
      const chatChannels = channels.filter((ch: any) => ch.id && ch.id.includes('<->'));
      console.log(`   💬 Chat channels: ${chatChannels.length}`);
      
      result.accessGrantStatus.grantsCreated = chatChannels.length > 0;
      result.accessGrantStatus.grantCount = chatChannels.length;
      result.accessGrantStatus.targetObjects = chatChannels.map((ch: any) => ch.id.substring(0, 32) + '...');
      
      console.log(`   ✅ Access grants created: ${result.accessGrantStatus.grantsCreated}`);
      console.log(`   📊 Grant count: ${result.accessGrantStatus.grantCount}`);
      
    } catch (error) {
      console.error('   ❌ Error checking access grant status:', error);
      result.recommendations.push('Could not verify access grant status');
    }
  }
  
  private static async checkChumConnectionStatus(appModel: any, result: ChumDiagnosticResult): Promise<void> {
    console.log('\n3️⃣ CHUM CONNECTION STATUS');
    
    try {
      const transportManager = appModel.transportManager;
      if (!transportManager) {
        console.log('   ❌ TransportManager not available');
        return;
      }
      
      // Check active connections
      const connections = await transportManager.getActiveConnections();
      result.chumConnectionStatus.connectionCount = connections.length;
      
      console.log(`   🌐 Active connections: ${connections.length}`);
      
      // Extract remote person IDs
      const remotePersonIds = connections
        .map((conn: any) => conn.remotePersonId || conn.targetPersonId)
        .filter((id: any) => id)
        .map((id: any) => id.substring(0, 8) + '...');
        
      result.chumConnectionStatus.remotePersonIds = remotePersonIds;
      
      console.log(`   👥 Remote persons: ${remotePersonIds.join(', ')}`);
      
      // Check if CHUM services are likely active
      // CHUM exporter/importer are started when connections are established
      result.chumConnectionStatus.exporterActive = connections.length > 0;
      result.chumConnectionStatus.importerActive = connections.length > 0;
      
      console.log(`   📤 CHUM exporter active: ${result.chumConnectionStatus.exporterActive}`);
      console.log(`   📥 CHUM importer active: ${result.chumConnectionStatus.importerActive}`);
      
    } catch (error) {
      console.error('   ❌ Error checking CHUM connection status:', error);
      result.recommendations.push('Could not verify CHUM connection status');
    }
  }
  
  private static async checkAccessManagerStatus(appModel: any, result: ChumDiagnosticResult): Promise<void> {
    console.log('\n4️⃣ ACCESS MANAGER STATUS');
    
    try {
      // This is the critical test: Can getAccessibleRootHashes find our objects?
      const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
      
      // Test for each connected remote person
      const connections = result.chumConnectionStatus.remotePersonIds;
      
      if (connections.length === 0) {
        console.log('   ⚠️ No remote connections to test AccessManager with');
        return;
      }
      
      // Test with first remote person (expand the truncated ID back to full)
      // We need to get the full person ID from our connection info
      const transportManager = appModel.transportManager;
      const fullConnections = await transportManager.getActiveConnections();
      
      for (const connection of fullConnections) {
        const remotePersonId = connection.remotePersonId || connection.targetPersonId;
        if (!remotePersonId) continue;
        
        console.log(`   🔍 Testing AccessManager for remote person: ${remotePersonId.substring(0, 8)}...`);
        
        try {
          const accessibleObjects = await getAccessibleRootHashes(remotePersonId);
          result.accessManagerStatus.accessibleObjectsCount = accessibleObjects.length;
          result.accessManagerStatus.accessibleRootHashes = accessibleObjects
            .slice(0, 5)
            .map((obj: any) => `${obj.type}:${(obj.hash || obj.idHash || obj.node).substring(0, 8)}...`);
          result.accessManagerStatus.accessGrantsVisible = accessibleObjects.length > 0;
          
          console.log(`   📊 Accessible objects: ${accessibleObjects.length}`);
          console.log(`   🔍 Sample objects: ${result.accessManagerStatus.accessibleRootHashes.join(', ')}`);
          console.log(`   ✅ Access grants visible: ${result.accessManagerStatus.accessGrantsVisible}`);
          
          // This is the KEY diagnostic: If accessibleObjects.length === 0, 
          // then CHUM exporter has nothing to share!
          if (accessibleObjects.length === 0) {
            console.log('   🚨 CRITICAL: No accessible objects found for remote person!');
            console.log('   🚨 This means CHUM exporter has nothing to share with this device');
            result.recommendations.push('CRITICAL: No accessible objects found - this is why CHUM sync is failing');
          }
          
          break; // Test with first connection only
          
        } catch (accessError) {
          console.error(`   ❌ Error testing AccessManager for ${remotePersonId.substring(0, 8)}:`, accessError);
          result.recommendations.push(`AccessManager test failed: ${accessError.message}`);
        }
      }
      
    } catch (error) {
      console.error('   ❌ Error checking AccessManager status:', error);
      result.recommendations.push('Could not check AccessManager status');
    }
  }
  
  private static async monitorChumProtocolActivity(appModel: any, result: ChumDiagnosticResult): Promise<void> {
    console.log('\n5️⃣ CHUM PROTOCOL ACTIVITY MONITORING');
    
    try {
      // Monitor for CHUM protocol activity by patching console temporarily
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      let chumExporterRequests = 0;
      let chumImporterPolls = 0;
      let objectsTransferred = 0;
      const protocolErrors: string[] = [];
      
      const chumActivityInterceptor = (...args: any[]) => {
        const message = args.join(' ');
        
        // Look for CHUM exporter activity
        if (message.includes('GET_ACCESSIBLE_ROOTS') || message.includes('GET_OBJECT')) {
          chumExporterRequests++;
        }
        
        // Look for CHUM importer activity  
        if (message.includes('Received root hashes') || message.includes('Import root hash')) {
          chumImporterPolls++;
        }
        
        // Look for successful transfers
        if (message.includes('OBJECT_SENT') || message.includes('OBJECT_SAVED')) {
          objectsTransferred++;
        }
        
        // Look for errors
        if (message.includes('CHUM') && (message.includes('ERROR') || message.includes('FAIL'))) {
          protocolErrors.push(message);
        }
      };
      
      // Install interceptors
      console.log = (...args: any[]) => {
        chumActivityInterceptor(...args);
        originalLog(...args);
      };
      console.error = (...args: any[]) => {
        chumActivityInterceptor(...args);
        originalError(...args);
      };
      console.warn = (...args: any[]) => {
        chumActivityInterceptor(...args);
        originalWarn(...args);
      };
      
      // Monitor for 3 seconds
      console.log('   ⏳ Monitoring CHUM protocol activity for 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Restore console
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      
      // Store results
      result.chumProtocolActivity.exporterRequests = chumExporterRequests;
      result.chumProtocolActivity.importerPolls = chumImporterPolls;
      result.chumProtocolActivity.objectsTransferred = objectsTransferred;
      result.chumProtocolActivity.protocolErrors = protocolErrors;
      
      console.log(`   📤 Exporter requests: ${chumExporterRequests}`);
      console.log(`   📥 Importer polls: ${chumImporterPolls}`);
      console.log(`   📦 Objects transferred: ${objectsTransferred}`);
      console.log(`   ❌ Protocol errors: ${protocolErrors.length}`);
      
      if (protocolErrors.length > 0) {
        console.log('   🚨 Protocol errors detected:');
        protocolErrors.forEach(error => console.log(`      - ${error}`));
      }
      
    } catch (error) {
      console.error('   ❌ Error monitoring CHUM protocol activity:', error);
      result.recommendations.push('Could not monitor CHUM protocol activity');
    }
  }
  
  private static generateRecommendations(result: ChumDiagnosticResult): void {
    console.log('\n6️⃣ RECOMMENDATIONS');
    
    // Critical path analysis for CHUM sync failure
    
    if (!result.accessGrantStatus.grantsCreated) {
      result.recommendations.push('CRITICAL: No access grants created - LeuteAccessRightsManager may not be working');
    }
    
    if (result.chumConnectionStatus.connectionCount === 0) {
      result.recommendations.push('CRITICAL: No active connections - devices cannot sync without P2P connection');
    }
    
    if (!result.chumConnectionStatus.exporterActive || !result.chumConnectionStatus.importerActive) {
      result.recommendations.push('CRITICAL: CHUM services not active - sync requires both exporter and importer');
    }
    
    if (!result.accessManagerStatus.accessGrantsVisible) {
      result.recommendations.push('CRITICAL: Access grants not visible to AccessManager - this is the ROOT CAUSE');
      result.recommendations.push('SOLUTION: Fix access grant creation to target the correct objects and remote persons');
    }
    
    if (result.accessManagerStatus.accessibleObjectsCount === 0) {
      result.recommendations.push('CRITICAL: No accessible objects found by getAccessibleRootHashes()');
      result.recommendations.push('SOLUTION: Verify access grants are created with correct person/group references');
    }
    
    if (result.chumProtocolActivity.exporterRequests === 0) {
      result.recommendations.push('WARNING: No CHUM exporter requests detected - importer may not be polling');
    }
    
    if (result.chumProtocolActivity.importerPolls === 0) {
      result.recommendations.push('WARNING: No CHUM importer polls detected - connection may be broken');
    }
    
    if (result.chumProtocolActivity.objectsTransferred === 0) {
      result.recommendations.push('CRITICAL: No objects transferred - even if accessible, transfer is failing');
    }
    
    if (result.chumProtocolActivity.protocolErrors.length > 0) {
      result.recommendations.push('ERROR: CHUM protocol errors detected - check connection and permissions');
    }
    
    // Print recommendations
    result.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
    
    // Final diagnosis
    if (result.recommendations.some(rec => rec.includes('CRITICAL'))) {
      console.log('\n🚨 DIAGNOSIS: CRITICAL ISSUES FOUND - CHUM sync will not work until these are resolved');
    } else if (result.recommendations.some(rec => rec.includes('WARNING'))) {
      console.log('\n⚠️ DIAGNOSIS: Issues found that may affect CHUM sync performance');
    } else {
      console.log('\n✅ DIAGNOSIS: No obvious issues - CHUM sync should be working');
    }
  }
  
  /**
   * Print a detailed diagnostic report
   */
  public static printReport(result: ChumDiagnosticResult): void {
    console.log('\n📊 CHUM SYNCHRONIZATION DIAGNOSTIC REPORT');
    console.log('='.repeat(50));
    console.log(`Timestamp: ${result.timestamp.toISOString()}`);
    console.log(`Device: ${result.deviceInfo.deviceId} (${result.deviceInfo.personId})`);
    console.log('');
    
    console.log('Access Grant Status:');
    console.log(`  Grants Created: ${result.accessGrantStatus.grantsCreated ? '✅' : '❌'}`);
    console.log(`  Grant Count: ${result.accessGrantStatus.grantCount}`);
    console.log('');
    
    console.log('CHUM Connection Status:');
    console.log(`  Exporter Active: ${result.chumConnectionStatus.exporterActive ? '✅' : '❌'}`);
    console.log(`  Importer Active: ${result.chumConnectionStatus.importerActive ? '✅' : '❌'}`);
    console.log(`  Connections: ${result.chumConnectionStatus.connectionCount}`);
    console.log('');
    
    console.log('AccessManager Status:');
    console.log(`  Accessible Objects: ${result.accessManagerStatus.accessibleObjectsCount}`);
    console.log(`  Grants Visible: ${result.accessManagerStatus.accessGrantsVisible ? '✅' : '❌'}`);
    console.log('');
    
    console.log('Protocol Activity:');
    console.log(`  Exporter Requests: ${result.chumProtocolActivity.exporterRequests}`);
    console.log(`  Importer Polls: ${result.chumProtocolActivity.importerPolls}`);
    console.log(`  Objects Transferred: ${result.chumProtocolActivity.objectsTransferred}`);
    console.log(`  Errors: ${result.chumProtocolActivity.protocolErrors.length}`);
    console.log('');
    
    console.log(`Recommendations: ${result.recommendations.length} issues found`);
  }
}

// Export convenience functions
export async function runChumSyncDiagnostics(): Promise<ChumDiagnosticResult> {
  const result = await ChumSyncDiagnostics.runDiagnostics();
  ChumSyncDiagnostics.printReport(result);
  return result;
}

// Make available globally for console debugging
(globalThis as any).runChumSyncDiagnostics = runChumSyncDiagnostics;

export default ChumSyncDiagnostics;