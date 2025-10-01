import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { ModelService } from './ModelService';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { Invitation } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import { parseInvitationUrl } from '../utils/invitation-url-parser';

/**
 * NetworkSettingsService
 * 
 * React interface for network settings and connection operations.
 * UPDATED: Now uses CommServerManager instead of ConnectionsModel to eliminate duplication.
 * 
 * NOTE: CommServerManager provides the single connection system for lama.
 */
export class NetworkSettingsService {
  private static _instance: NetworkSettingsService | null = null;
  private _deviceSettingsService: any = null;
  private _commServerReadyLogged = false;

  // Events for network state changes
  public readonly onNetworkStateChanged = new OEvent<(isConnected: boolean) => void>();
  public readonly onConnectionsChanged = new OEvent<() => void>();
  public readonly onDeviceDiscoveryChanged = new OEvent<() => void>();
  public readonly onCommServerUrlChanged = new OEvent<(url: string) => void>();

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor() {
    // Get device settings service from app model
    const appModel = ModelService.getModel();
    // Note: services property removed from AppModel, device settings handled differently now
    this._deviceSettingsService = null;
    
    console.log('[NetworkSettingsService] Full-featured service initialized - using CommServerManager');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): NetworkSettingsService {
    if (!NetworkSettingsService._instance) {
      NetworkSettingsService._instance = new NetworkSettingsService();
    }
    return NetworkSettingsService._instance;
  }

  /**
   * Check if CommServerManager is ready for use
   * UPDATED: Now checks CommServerManager which wraps ConnectionsModel
   */
  private isCommServerManagerReady(): boolean {
    const appModel = ModelService.getModel();
    
    // Basic existence checks
    if (!appModel) {
      console.log('[NetworkSettingsService] ❌ AppModel not available');
      return false;
    }
    
    // Check AppModel initialization state using StateMachine currentState
    if (appModel.currentState !== 'Initialised') {
      console.log(`[NetworkSettingsService] ❌ AppModel not ready: state is '${appModel.currentState}', expected 'Initialised'`);
      return false;
    }
    
    // Check if CommServerManager is available
    if (!appModel.commServerManager) {
      console.log('[NetworkSettingsService] ❌ CommServerManager not ready: appModel.commServerManager does not exist');
      return false;
    }
    
    try {
      // Check for required methods on CommServerManager
      const hasRequiredMethods = (
        typeof appModel.commServerManager.getConnectionsModel === 'function' &&
        typeof appModel.commServerManager.getStats === 'function' &&
        typeof appModel.commServerManager.getConnectionInfo === 'function'
      );
      
      if (!hasRequiredMethods) {
        console.log('[NetworkSettingsService] ❌ CommServerManager not ready: Required methods missing');
        return false;
      }
      
      // Only log success once per session to reduce noise
      if (!this._commServerReadyLogged) {
        console.log('[NetworkSettingsService] ✅ CommServerManager is ready');
        this._commServerReadyLogged = true;
      }
      return true;
    } catch (error) {
      console.error('[NetworkSettingsService] ❌ CommServerManager not ready: Error checking methods:', error);
      return false;
    }
  }

  /**
   * Private helper to get the AppModel and verify its readiness.
   * Throws a detailed error if the system is not ready for network operations.
   * This centralizes readiness checks for all public methods.
   * @returns The ready-to-use AppModel instance.
   */
  private getReadyAppModel() {
    const appModel = ModelService.getModel();

    if (!appModel) {
      throw new Error('[NetworkSettingsService] AppModel not available. The application might not be fully initialized.');
    }
    if (appModel.currentState !== 'Initialised') {
      throw new Error(`[NetworkSettingsService] AppModel not ready. Current state: '${appModel.currentState}'.`);
    }
    if (!appModel.connections) {
      throw new Error('[NetworkSettingsService] ConnectionsModel not available. The network layer is not ready.');
    }
    if (!appModel.commServerManager) {
        throw new Error('[NetworkSettingsService] CommServerManager not available.');
    }

    return appModel;
  }

  /**
   * Get connection status from ConnectionsModel
   */
  public isLeuteConnected(): boolean {
    try {
      const appModel = this.getReadyAppModel();
      const connectionsInfo = appModel.connections.connectionsInfo();
      return Array.isArray(connectionsInfo) && connectionsInfo.length > 0;
    } catch (error) {
      console.warn('[NetworkSettingsService] Could not check connection status:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Get current connections from ConnectionsModel via TransportManager
   * Transforms raw connection data into the structure expected by the UI
   */
  public getConnections(): any[] {
    try {
      const appModel = this.getReadyAppModel();
      const rawConnections = appModel.connections.connectionsInfo();
      
      if (!Array.isArray(rawConnections)) {
        console.warn('[NetworkSettingsService] ConnectionsModel.connectionsInfo() returned non-array:', typeof rawConnections);
        return [];
      }
      
      // Transform raw connection data into the structure expected by the UI
      return rawConnections.map(conn => ({
        ...conn,
        // Ensure each connection has the summary structure the UI expects
        summary: conn.summary || {
          activeConnections: conn.isConnected ? 1 : 0,
          totalConnections: 1
        }
      }));
    } catch (error) {
      console.warn('[NetworkSettingsService] Could not get connections:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * Enable all connections (this is what "connect to leute" should do)
   */
  public async connectToLeute(): Promise<boolean> {
    try {
      const appModel = this.getReadyAppModel();
      // Connections are automatically managed, so we just check the status
      const connectionsInfo = appModel.connections.connectionsInfo();
      this.onConnectionsChanged.emit();
      return Array.isArray(connectionsInfo) && connectionsInfo.length > 0;
    } catch (error) {
      console.error('[NetworkSettingsService] Error connecting to Leute:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Disconnect from leute.one
   */
  public async disconnectFromLeute(): Promise<void> {
    try {
      const appModel = this.getReadyAppModel();
      const transportManager = appModel.getTransportManager();
      if (transportManager) {
        await transportManager.shutdown();
        this.onNetworkStateChanged.emit(false);
      }
    } catch (error) {
      console.error('[NetworkSettingsService] Error disconnecting from leute:', error instanceof Error ? error.message : String(error));
      // Re-throw to allow UI to handle the error state
      throw new Error(`Disconnection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if device discovery is enabled
   * Uses the actual DeviceDiscoveryModel
   */
  public isDeviceDiscoveryEnabled(): boolean {
    const appModel = ModelService.getModel();
    if (!appModel?.deviceDiscoveryModel) {
      return false;
    }
    return appModel.deviceDiscoveryModel.isDiscovering();
  }

  /**
   * Set device discovery enabled state
   * Uses the actual DeviceDiscoveryModel
   */
  public async setDeviceDiscoveryEnabled(enabled: boolean): Promise<void> {
    console.log(`[NetworkSettingsService] Setting device discovery enabled: ${enabled}`);
    const appModel = ModelService.getModel();
    if (!appModel?.deviceDiscoveryModel) {
      console.warn('[NetworkSettingsService] DeviceDiscoveryModel not available');
      return;
    }

    try {
      if (enabled) {
        await appModel.deviceDiscoveryModel.startDiscovery();
      } else {
        await appModel.deviceDiscoveryModel.stopDiscovery();
      }
      this.onDeviceDiscoveryChanged.emit();
    } catch (error) {
      console.error('[NetworkSettingsService] Error toggling device discovery:', error);
      throw error;
    }
  }

  /**
   * Check if device auto-connect is enabled
   * Delegates to device settings
   */
  public isDeviceAutoConnectEnabled(): boolean {
    try {
      // Import device settings service dynamically to avoid circular dependencies
      const appModel = ModelService.getModel();
      if (!appModel) {
        return false;
      }

      // Check if there's a device settings service available
      // For now, return false as auto-connect is handled separately
      return false;
    } catch (error) {
      console.warn('[NetworkSettingsService] Error checking auto-connect state:', error);
      return false;
    }
  }

  /**
   * Set device auto-connect enabled state
   * Delegates to device settings
   */
  public async setDeviceAutoConnectEnabled(enabled: boolean): Promise<void> {
    console.log(`[NetworkSettingsService] Device auto-connect setting: ${enabled}`);
    try {
      // Import device settings service dynamically to avoid circular dependencies
      const appModel = ModelService.getModel();
      if (!appModel) {
        console.warn('[NetworkSettingsService] AppModel not available for auto-connect setting');
        return;
      }

      // For now, just emit the event - auto-connect is handled in device settings
      this.onDeviceDiscoveryChanged.emit();
      console.log('[NetworkSettingsService] Auto-connect setting is handled by device settings');
    } catch (error) {
      console.error('[NetworkSettingsService] Error setting auto-connect:', error);
      throw error;
    }
  }

  /**
   * Set leute connections enabled state (placeholder - not available in actual ConnectionsModel)
   */
  public setLeuteConnectionsEnabled(enabled: boolean): void {
    if (!this.isCommServerManagerReady()) {
      console.warn('[NetworkSettingsService] CommServerManager not ready, cannot set leute connections enabled');
      return;
    }
    
    console.log(`[NetworkSettingsService] Setting leute connections enabled: ${enabled} (using enable/disable all connections)`);
    
    // Use the actual available methods
    if (enabled) {
      this.connectToLeute().catch(error => 
        console.error('[NetworkSettingsService] Error enabling connections:', error)
      );
    } else {
      this.disconnectFromLeute().catch(error => 
        console.error('[NetworkSettingsService] Error disabling connections:', error)
      );
    }
  }

  /**
   * Accept a pairing invitation using CommServerManager
   * UPDATED: Now uses CommServerManager instead of ConnectionsModel
   */
  public async acceptInvitation(invitation: Invitation): Promise<boolean> {
    try {
      const appModel = this.getReadyAppModel();
      // The actual connection is handled by the transport layer via connectUsingInvitation
      // This method just trusts the keys.
      await appModel.connections.addTrustedKeys(invitation.token, invitation.publicKey);
      return true;
    } catch (error) {
      console.error('[NetworkSettingsService] Failed to accept invitation:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Accept a pairing invitation from URL - Simplified approach using core pairing
   * Just use the core connectUsingInvitation directly like one.leute does
   */
  public async acceptInvitationFromUrl(invitationUrl: string): Promise<boolean> {
    console.log(`[NetworkSettingsService] Accepting invitation from URL: ${invitationUrl}`);
    const parsed = parseInvitationUrl(invitationUrl);

    if (parsed.error || !parsed.invitation) {
      console.error(`[NetworkSettingsService] Failed to parse invitation URL: ${parsed.error || 'No invitation data found'}`);
      return false;
    }

    console.log('[NetworkSettingsService] ✅ URL parsed successfully. Proceeding to accept invitation.');
    // This now calls the robust acceptInvitation method
    return await this.acceptInvitation(parsed.invitation);
  }

  /**
   * Enable connections to a person using CommServerManager
   * UPDATED: CommServerManager handles connections automatically
   */
  public async enableConnectionsToPerson(personId: SHA256IdHash<Person>): Promise<boolean> {
    try {
      this.getReadyAppModel();
      // TODO: Implement logic to enable connection to a specific person
      console.error(`enableConnectionsToPerson for ${personId} is not yet implemented.`);
      throw new Error('Not implemented');
    } catch (error) {
        console.error(`[NetworkSettingsService] Could not enable connection to ${personId}:`, error instanceof Error ? error.message : String(error));
        return false;
    }
  }

  /**
   * Disable connections to a person using CommServerManager
   * UPDATED: CommServerManager handles connections automatically
   */
  public async disableConnectionsToPerson(personId: SHA256IdHash<Person>): Promise<boolean> {
    try {
        this.getReadyAppModel();
        // TODO: Implement logic to disable connection to a specific person
        console.error(`disableConnectionsToPerson for ${personId} is not yet implemented.`);
        throw new Error('Not implemented');
    } catch (error) {
        console.error(`[NetworkSettingsService] Could not disable connection to ${personId}:`, error instanceof Error ? error.message : String(error));
        return false;
    }
  }

  /**
   * Check if connected to a person using CommServerManager
   * UPDATED: Now uses CommServerManager connections
   */
  public isConnectedToPerson(personId: SHA256IdHash<Person>): boolean {
    try {
        const appModel = this.getReadyAppModel();
        const connections = appModel.connections.connectionsInfo();
        return connections.some(c => c.remotePersonId === personId && c.isConnected);
    } catch (error) {
        console.warn(`[NetworkSettingsService] Could not check connection for person ${personId}:`, error instanceof Error ? error.message : String(error));
        return false;
    }
  }

  /**
   * Run network diagnostics using ConnectionsModel
   * UPDATED: Now uses ConnectionsModel for connection information
   */
  public runNetworkDiagnostics(): any {
    if (!this.isCommServerManagerReady()) {
      console.warn('[NetworkSettingsService] ConnectionsModel not ready, cannot run network diagnostics');
      return null;
    }
    
    const appModel = ModelService.getModel();
    try {
      const diagnostics = {
        onlineState: this.isLeuteConnected(),
        connections: [] as any[],
        connectionsInfo: null as any,
        debugInfo: 'ConnectionsModel diagnostics'
      };
      
      if (appModel?.connections) {
        diagnostics.connections = appModel.connections.connectionsInfo() || [];
        diagnostics.connectionsInfo = {
          totalConnections: Array.isArray(diagnostics.connections) ? diagnostics.connections.length : 0,
          activeConnections: Array.isArray(diagnostics.connections) ? diagnostics.connections.filter((conn: any) => conn.isConnected).length : 0
        };
      }
      
      return diagnostics;
    } catch (error) {
      console.error('[NetworkSettingsService] Error running network diagnostics:', error);
      return null;
    }
  }

  /**
   * Get edda domain from settings
   */
  public getEddaDomain(): string {
    const appModel = ModelService.getModel();
    if (appModel?.propertyTree) {
      try {
        // Try to get from property tree first
        const savedDomain = appModel.propertyTree.getValue('eddaDomain');
        if (savedDomain) {
          return savedDomain;
        }
      } catch (error) {
        console.warn('[NetworkSettingsService] Could not get edda domain from property tree:', error);
      }
    }
    
    // Return default domain if not found
    return 'edda.dev.refinio.one';
  }

  /**
   * Set edda domain in settings
   */
  public async setEddaDomain(domain: string): Promise<void> {
    const appModel = ModelService.getModel();
    if (!appModel?.propertyTree) {
      throw new Error('PropertyTree not available');
    }
    
    try {
      // Save to property tree
      await appModel.propertyTree.setValue('eddaDomain', domain);
      console.log('[NetworkSettingsService] Edda domain saved:', domain);
    } catch (error) {
      console.error('[NetworkSettingsService] Error saving edda domain:', error);
      throw error;
    }
  }

  /**
   * Get current CommServer URL from settings
   */
  public getCommServerUrl(): string {
    const appModel = ModelService.getModel();
    if (appModel?.propertyTree) {
      try {
        // Try to get from property tree first
        const savedUrl = appModel.propertyTree.getValue('commServerUrl');
        if (savedUrl) {
          return savedUrl;
        }
      } catch (error) {
        console.warn('[NetworkSettingsService] Could not get CommServer URL from property tree:', error);
      }
    }
    
    // Return default URL if not found
    return 'wss://comm10.dev.refinio.one';
  }

  /**
   * Set CommServer URL in settings
   */
  public async setCommServerUrl(url: string): Promise<void> {
    const appModel = ModelService.getModel();
    if (!appModel?.propertyTree) {
      throw new Error('PropertyTree not available');
    }
    
    try {
      // Validate URL format
      if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
        throw new Error('CommServer URL must start with wss:// or ws://');
      }
      
      // Save to property tree
      await appModel.propertyTree.setValue('commServerUrl', url);
      console.log('[NetworkSettingsService] CommServer URL saved:', url);
      
      // Emit change event
      this.onCommServerUrlChanged.emit(url);
    } catch (error) {
      console.error('[NetworkSettingsService] Error saving CommServer URL:', error);
      throw error;
    }
  }

  /**
   * Reset CommServer URL to default
   */
  public async resetCommServerUrl(): Promise<void> {
    const defaultUrl = 'wss://comm10.dev.refinio.one';
    await this.setCommServerUrl(defaultUrl);
  }

  /**
   * Debug dump connections using ConnectionsModel
   * UPDATED: Now uses ConnectionsModel connection info
   */
  public debugDumpConnections(): void {
    if (!this.isCommServerManagerReady()) {
      console.warn('[NetworkSettingsService] ConnectionsModel not ready, cannot debug dump connections');
      return;
    }
    
    const appModel = ModelService.getModel();
    try {
      if (appModel?.connections) {
        const connectionsInfo = appModel.connections.connectionsInfo();
        console.log('[NetworkSettingsService] Connections info:', connectionsInfo);
        console.log('[NetworkSettingsService] Connection count:', Array.isArray(connectionsInfo) ? connectionsInfo.length : 0);
      }
    } catch (error) {
      console.error('[NetworkSettingsService] Error dumping connections:', error);
    }
  }

  /**
   * Debug ConnectionsModel and CommServer registration status
   * This can be called from UI to diagnose connection issues
   */
  public async debugCommServerStatus(): Promise<void> {
    console.log('[NetworkSettingsService] 🔍 Debugging CommServer registration status...');
    
    const appModel = ModelService.getModel();
    if (!appModel) {
      console.log('[NetworkSettingsService] ❌ No AppModel available');
      return;
    }
    
    // Call the AppModel's debug method if available
    if (typeof (appModel as any).debugCommServerRegistration === 'function') {
      await (appModel as any).debugCommServerRegistration();
    } else {
      console.log('[NetworkSettingsService] ❌ AppModel.debugCommServerRegistration method not available');
    }
  }
}

/**
 * Get the NetworkSettingsService singleton instance
 */
export function getNetworkSettingsService(): NetworkSettingsService {
  return NetworkSettingsService.getInstance();
}

export default {
  getNetworkSettingsService
}; 