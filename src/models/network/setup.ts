/**
 * Network Setup - Handles initialization and configuration of networking components
 * 
 * This module provides utilities for setting up and configuring the networking layer
 * including UDP sockets, QUIC transport, and device discovery.
 */

import { UdpModel } from './UdpModel';
import { QuicModel } from './QuicModel';
import { DeviceDiscoveryModel } from './DeviceDiscoveryModel';

// Import the authoritative service type definitions
import { NetworkServiceType } from './interfaces';

// Re-export for backward compatibility (deprecated - use NetworkServiceType directly)
export const SERVICE_TYPE_DISCOVERY = NetworkServiceType.DISCOVERY_SERVICE;
export const SERVICE_TYPE_CREDENTIALS = NetworkServiceType.CREDENTIAL_SERVICE;
export const SERVICE_TYPE_LED_CONTROL = NetworkServiceType.LED_CONTROL_SERVICE;
export const SERVICE_TYPE_ESP32_CONTROL = NetworkServiceType.ESP32_DATA_SERVICE;
export const SERVICE_TYPE_JOURNAL_SYNC = NetworkServiceType.JOURNAL_SYNC_SERVICE;

// Export commonly used service type
export const DISCOVERY_SERVICE_TYPE = NetworkServiceType.DISCOVERY_SERVICE;

// Use React Native's EventEmitter instead of Node.js events
class EventEmitter {
  private listeners: Map<string, Function[]> = new Map();
  
  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }
  
  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }
  
  addListener = this.on;
  
  once(event: string, listener: Function): this {
    const onceWrapper = (...args: any[]) => {
      this.removeListener(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }
  
  removeListener(event: string, listener: Function): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
        if (eventListeners.length === 0) {
          this.listeners.delete(event);
        }
      }
    }
    return this;
  }
  
  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

/**
 * Network configuration interface
 */
export interface NetworkConfig {
  udp?: {
    port?: number;
    host?: string;
    broadcast?: boolean;
  };
  discovery?: {
    enabled?: boolean;
    interval?: number;
    timeout?: number;
  };
  debug?: boolean;
}

/**
 * Initialize the network subsystem with optional configuration
 */
export async function initializeNetwork(config?: NetworkConfig): Promise<{
  udp: UdpModel;
  quic: QuicModel;
  discovery: DeviceDiscoveryModel;
}> {
  // Get model instances
  const udp = UdpModel.getInstance();
  const quic = QuicModel.getInstance();
  const discovery = DeviceDiscoveryModel.getInstance();
  
  // Initialize UDP model first
  if (!udp.isInitialized()) {
    await udp.init();
  }
  
  // Initialize QUIC with UDP configuration
  if (!quic.isInitialized()) {
    await quic.init({
      port: config?.udp?.port || 49497,
      host: config?.udp?.host || '0.0.0.0'
    });
  }
  
  // Initialize discovery if enabled
  if (config?.discovery?.enabled !== false) {
    await discovery.init();
  }
  
  return { udp, quic, discovery };
}

/**
 * Shutdown the network subsystem
 */
export async function shutdownNetwork(): Promise<void> {
  const discovery = DeviceDiscoveryModel.getInstance();
  const quic = QuicModel.getInstance();
  const udp = UdpModel.getInstance();
  
  // Shutdown in reverse order
  await discovery.shutdown();
  await quic.shutdown();
  await udp.shutdown();
}

/**
 * Network health check
 */
export async function checkNetworkHealth(): Promise<{
  udp: boolean;
  quic: boolean;
  discovery: boolean;
}> {
  const udp = UdpModel.getInstance();
  const quic = QuicModel.getInstance();
  const discovery = DeviceDiscoveryModel.getInstance();
  
  // Try to check if discovery is working by calling getDevices()
  let discoveryWorking = false;
  try {
    discovery.getDevices(); // This will work if initialized
    discoveryWorking = true;
  } catch {
    discoveryWorking = false;
  }
  
  return {
    udp: udp.isInitialized(),
    quic: quic.isInitialized(),
    discovery: discoveryWorking
  };
}

/**
 * Initialize QUIC transport specifically
 * This function is called during platform initialization
 */
export async function initializeQuicTransport(options?: {
  port?: number;
  host?: string;
}): Promise<QuicModel> {
  const quic = QuicModel.getInstance();
  
  if (!quic.isInitialized()) {
    await quic.init({
      port: options?.port || 49497,
      host: options?.host || '0.0.0.0'
    });
  }
  
  return quic;
} 