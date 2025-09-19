/**
 * Network Connectivity Service
 * 
 * This service monitors network connectivity and provides
 * diagnostic tools for troubleshooting network issues.
 */

import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import Debug from 'debug';

// Enable debug logging
const debug = Debug('one:network:connectivity');

// Network status types
export enum ConnectionType {
  NONE = 'none',
  UNKNOWN = 'unknown',
  WIFI = 'wifi',
  CELLULAR = 'cellular',
  BLUETOOTH = 'bluetooth',
  ETHERNET = 'ethernet',
  WIMAX = 'wimax',
  VPN = 'vpn',
  OTHER = 'other'
}

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: ConnectionType;
  isWifi: boolean;
  isCellular: boolean;
  details: any;
}

export interface DiagnosticResult {
  success: boolean;
  timestamp: number;
  error?: string;
  details?: any;
}

/**
 * Network Connectivity Service
 * 
 * This service monitors network connectivity status and 
 * provides diagnostic tools for troubleshooting.
 */
export class NetworkConnectivityService {
  // Network status
  private networkStatus: NetworkStatus = {
    isConnected: false,
    isInternetReachable: null,
    type: ConnectionType.UNKNOWN,
    isWifi: false,
    isCellular: false,
    details: null
  };
  
  // Diagnostic results
  private diagnosticResults: Map<string, DiagnosticResult> = new Map();
  
  // Events
  public readonly onNetworkStatusChanged = new OEvent<(status: NetworkStatus) => void>();
  public readonly onDiagnosticComplete = new OEvent<(testName: string, result: DiagnosticResult) => void>();
  
  // Connection intervals
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private diagnosisInProgress: boolean = false;
  
  /**
   * Constructor
   */
  constructor() {
    debug('NetworkConnectivityService created');
  }
  
  /**
   * Initialize the service
   */
  public async init(): Promise<void> {
    debug('Initializing NetworkConnectivityService');
    
    try {
      // Start monitoring network status
      await this.startNetworkMonitoring();
      
      debug('NetworkConnectivityService initialized');
    } catch (error) {
      debug('Error initializing NetworkConnectivityService: %o', error);
      console.error('[NetworkConnectivityService] Initialization error:', error);
      
      // Re-throw to let caller handle
      throw error;
    }
  }
  
  /**
   * Start network monitoring
   */
  private async startNetworkMonitoring(): Promise<void> {
    debug('Starting network monitoring');
    
    try {
      // Register for network info changes
      if (NetInfo && NetInfo.addEventListener) {
        NetInfo.addEventListener(state => {
          this.handleNetworkChange(state);
        });
        
        // Get current status
        const state = await NetInfo.fetch();
        this.handleNetworkChange(state);
      } else {
        debug('NetInfo not available');
        console.warn('[NetworkConnectivityService] NetInfo not available - network monitoring disabled');
      }
      
      // Start periodic connectivity checks if needed
      this.startPeriodicConnectivityChecks();
      
      debug('Network monitoring started');
    } catch (error) {
      debug('Error starting network monitoring: %o', error);
      console.error('[NetworkConnectivityService] Failed to start network monitoring:', error);
      throw error;
    }
  }
  
  /**
   * Handle network change event
   */
  private handleNetworkChange(state: NetInfoState): void {
    debug('Network state changed: %o', state);
    
    // Update our internal state
    this.networkStatus = {
      isConnected: !!state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: (state.type as ConnectionType) || ConnectionType.UNKNOWN,
      isWifi: state.type === 'wifi',
      isCellular: state.type === 'cellular',
      details: state.details || null
    };
    
    // Emit event
    this.onNetworkStatusChanged.emit(this.networkStatus);
    
    // Log status for debugging
    debug('Updated network status: %o', this.networkStatus);
  }
  
  /**
   * Start periodic connectivity checks
   */
  private startPeriodicConnectivityChecks(): void {
    // Clear any existing interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Check connectivity every 5 minutes
    const CHECK_INTERVAL = 5 * 60 * 1000;
    
    this.monitoringInterval = setInterval(() => {
      // Only run if we're connected and not already diagnosing
      if (this.networkStatus.isConnected && !this.diagnosisInProgress) {
        this.runBackgroundConnectivityCheck()
          .catch(error => {
            debug('Background connectivity check error: %o', error);
          });
      }
    }, CHECK_INTERVAL);
    
    debug('Periodic connectivity checks started');
  }
  
  /**
   * Run a background connectivity check
   */
  private async runBackgroundConnectivityCheck(): Promise<void> {
    debug('Running background connectivity check');
    
    this.diagnosisInProgress = true;
    
    try {
      // Test basic network connectivity
      await this.testNetworkInfo();
      
      debug('Background connectivity check complete');
    } catch (error) {
      debug('Error in background connectivity check: %o', error);
      console.error('[NetworkConnectivityService] Background connectivity check error:', error);
    } finally {
      this.diagnosisInProgress = false;
    }
  }
  
  /**
   * Get current network status
   */
  public getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }
  
  /**
   * Run network diagnostics
   * 
   * This method runs a series of network diagnostic tests
   * to help troubleshoot connectivity issues.
   */
  public async runNetworkDiagnostics(): Promise<Map<string, DiagnosticResult>> {
    debug('Running network diagnostics');
    
    if (this.diagnosisInProgress) {
      debug('Diagnosis already in progress, returning previous results');
      return new Map(this.diagnosticResults);
    }
    
    this.diagnosisInProgress = true;
    
    try {
      // Clear previous results
      this.diagnosticResults.clear();
      
      // Run network info test
      await this.testNetworkInfo();
      
      debug('Network diagnostics complete');
      
      return new Map(this.diagnosticResults);
    } catch (error) {
      debug('Error running network diagnostics: %o', error);
      console.error('[NetworkConnectivityService] Network diagnostics error:', error);
      
      // Return what we have so far
      return new Map(this.diagnosticResults);
    } finally {
      this.diagnosisInProgress = false;
    }
  }
  
  /**
   * Test network info
   */
  private async testNetworkInfo(): Promise<DiagnosticResult> {
    debug('Testing network info');
    
    const testName = 'networkInfo';
    const result: DiagnosticResult = {
      success: false,
      timestamp: Date.now()
    };
    
    try {
      // Get current network state
      const networkState = await NetInfo.fetch();
      
      // Network is considered available if we have a connection
      result.success = !!networkState.isConnected;
      result.details = networkState;
      
      debug('Network info test complete: %o', result);
    } catch (error) {
      debug('Network info test error: %o', error);
      result.error = `Network info test failed: ${error instanceof Error ? error.message : String(error)}`;
      result.success = false;
    }
    
    // Store and emit result
    this.diagnosticResults.set(testName, result);
    this.onDiagnosticComplete.emit(testName, result);
    
    return result;
  }
  
  /**
   * Get diagnostic results
   */
  public getDiagnosticResults(): Map<string, DiagnosticResult> {
    return new Map(this.diagnosticResults);
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    debug('Cleaning up NetworkConnectivityService');
    
    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Remove all listeners
    this.onNetworkStatusChanged.emit = () => false;
    this.onDiagnosticComplete.emit = () => false;
    
    debug('NetworkConnectivityService cleanup complete');
  }
}

// NetInfoState interface
interface NetInfoState {
  type: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  details: any;
} 