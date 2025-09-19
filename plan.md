# Refactoring Plan: Separating UDP, QUIC, and Discovery Capabilities

## Current Issues

1. **Unclear Component Boundaries and Responsibilities**
   - Overlapping responsibilities between `QuicModel`, `UDPManager`, and `DeviceDiscoveryManager`
   - No clear dependency direction

2. **Initialization Order Dependencies**
   - Complex initialization chain causing race conditions
   - Potential for multiple initializations of the same components

3. **Multiple Initialization Points**
   - Inconsistent initialization patterns
   - Direct and indirect access to native modules

4. **Error: "QUIC transport already initialized"**
   - Caused by multiple initialization attempts

5. **Error: "UDPNative.create is not a function"**
   - Module loading issues across JavaScript/native boundaries

## Architecture Vision

Following ONE's architectural principles:

1. **Clear Separation of Concerns**
   - UDP layer should be independent and not depend on QUIC
   - QUIC layer should depend on UDP, not create it
   - Device discovery should only depend on QUIC's public API

2. **Single Instance per JavaScript Runtime**
   - Proper singleton implementation for each component
   - Clear initialization and lifecycle management

3. **Avoid Cyclic Dependencies**
   - Establish clear dependency hierarchy:
     - UDP (lowest level, no dependencies)
     - QUIC (depends on UDP)
     - Device Discovery (depends on QUIC)

4. **Platform Implementation**
   - Consistent approach to accessing native modules
   - Clear platform-specific adapters

## Implementation Plan

### Phase 1: Refactor UDP Layer

1. **Create UdpService Singleton**
   - Create a dedicated UDP service that encapsulates native module access
   - Implement proper lifecycle management (init, shutdown)
   - Handle platform-specific implementations through adapters

2. **Implement Clean UDP API**
   - Provide socket creation, binding, sending
   - Implement proper event handling
   - Remove all QUIC-specific code

3. **Consolidate Configuration**
   - Create a single source of truth for UDP configuration
   - Remove hardcoded values

### Phase 2: Refactor QUIC Layer

1. **Create QuicService Singleton**
   - Create a dedicated QUIC service that depends on UdpService
   - Implement proper lifecycle management
   - Handle platform-specific implementations

2. **Implement Clean QUIC API**
   - Provide connection management, packet handling
   - Implement proper event handling
   - Clearly separate from UDP concerns

3. **Proper Dependency Injection**
   - QUIC receives UDP service instance, doesn't create it
   - Establish clear initialization order

### Phase 3: Refactor Device Discovery

1. **Create DeviceDiscoveryService**
   - Use proper dependency injection for QUIC dependency
   - Implement clear error boundaries
   - Separate discovery concerns from transport concerns

2. **Consolidate Configuration**
   - Create a single source of truth for discovery configuration
   - Extract hardcoded values to configuration

### Phase 4: Integration with AppModel

1. **Centralize Initialization**
   - Manage initialization order in AppModel
   - Implement proper error handling and recovery
   - Clear dependency injection

2. **Lifecycle Management**
   - Proper shutdown sequence
   - Resource cleanup
   - Event unsubscription

## Specific Code Changes

### UdpService Implementation

```typescript
// src/services/network/UdpService.ts
import { NativeModules, NativeEventEmitter } from 'react-native';
import { EventEmitter } from 'events';
import { Buffer } from 'buffer';

export interface UdpSocketOptions {
  // Socket options
}

export interface UdpRemoteInfo {
  // Remote info
}

export interface UdpSocket extends EventEmitter {
  // Socket interface
}

/**
 * Singleton service for UDP operations
 * Encapsulates access to native UDP module
 */
export class UdpService {
  private static instance: UdpService | null = null;
  private initialized = false;
  private sockets = new Map<number, UdpSocket>();
  private nativeModule: any;
  private eventEmitter: NativeEventEmitter | null = null;

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): UdpService {
    if (!UdpService.instance) {
      UdpService.instance = new UdpService();
    }
    return UdpService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize native module
    this.nativeModule = NativeModules.UDPModule;
    if (!this.nativeModule) {
      throw new Error('UDP native module not available');
    }

    // Initialize event emitter
    this.eventEmitter = new NativeEventEmitter(this.nativeModule);
    
    // Set up event handling
    this.setupEventHandlers();
    
    this.initialized = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public createSocket(options: UdpSocketOptions): UdpSocket {
    if (!this.initialized) {
      throw new Error('UdpService not initialized');
    }
    
    // Implementation details
    
    return {} as UdpSocket; // Placeholder
  }

  // Other public methods

  private setupEventHandlers(): void {
    // Setup event handlers
  }

  public shutdown(): void {
    // Cleanup resources
    this.initialized = false;
  }
}
```

### QuicService Implementation

```typescript
// src/services/network/QuicService.ts
import { EventEmitter } from 'events';
import { UdpService } from './UdpService';

export interface QuicTransportOptions {
  // Transport options
}

export interface QuicConnection {
  // Connection interface
}

/**
 * Singleton service for QUIC operations
 * Depends on UdpService for low-level transport
 */
export class QuicService {
  private static instance: QuicService | null = null;
  private initialized = false;
  private udpService: UdpService;
  private connections = new Map<string, QuicConnection>();
  private events = new EventEmitter();

  private constructor(udpService: UdpService) {
    this.udpService = udpService;
  }

  public static getInstance(udpService?: UdpService): QuicService {
    if (!QuicService.instance) {
      if (!udpService) {
        throw new Error('UdpService must be provided for initial initialization');
      }
      QuicService.instance = new QuicService(udpService);
    }
    return QuicService.instance;
  }

  public async initialize(options?: QuicTransportOptions): Promise<void> {
    if (this.initialized) return;

    // Ensure UDP service is initialized
    if (!this.udpService.isInitialized()) {
      await this.udpService.initialize();
    }

    // Initialize QUIC implementation
    
    this.initialized = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  // Other public methods

  public shutdown(): void {
    // Cleanup resources
    this.initialized = false;
  }
}
```

### DeviceDiscoveryService Implementation

```typescript
// src/services/network/DeviceDiscoveryService.ts
import { EventEmitter } from 'events';
import { QuicService } from './QuicService';

export interface DeviceDiscoveryOptions {
  discoveryPort: number;
  discoveryInterval: number;
  // Other options
}

export interface Device {
  // Device interface
}

/**
 * Service for discovering devices on the network
 * Depends on QuicService for transport
 */
export class DeviceDiscoveryService {
  private static instance: DeviceDiscoveryService | null = null;
  private initialized = false;
  private quicService: QuicService;
  private options: DeviceDiscoveryOptions;
  private devices = new Map<string, Device>();
  private events = new EventEmitter();
  private discoveryInterval: NodeJS.Timeout | null = null;

  private constructor(quicService: QuicService, options: DeviceDiscoveryOptions) {
    this.quicService = quicService;
    this.options = options;
  }

  public static getInstance(quicService?: QuicService, options?: DeviceDiscoveryOptions): DeviceDiscoveryService {
    if (!DeviceDiscoveryService.instance) {
      if (!quicService || !options) {
        throw new Error('QuicService and options must be provided for initial initialization');
      }
      DeviceDiscoveryService.instance = new DeviceDiscoveryService(quicService, options);
    }
    return DeviceDiscoveryService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure QUIC service is initialized
    if (!this.quicService.isInitialized()) {
      await this.quicService.initialize();
    }

    // Start discovery process
    
    this.initialized = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  // Other public methods

  public shutdown(): void {
    // Cleanup resources
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    this.initialized = false;
  }
}
```

### AppModel Integration

```typescript
// src/models/AppModel.ts (excerpt)
import { UdpService } from '../services/network/UdpService';
import { QuicService } from '../services/network/QuicService';
import { DeviceDiscoveryService } from '../services/network/DeviceDiscoveryService';

export class AppModel extends Model {
  private udpService: UdpService;
  private quicService: QuicService;
  private deviceDiscoveryService: DeviceDiscoveryService;
  
  constructor() {
    super();
    
    // Get service instances - don't initialize yet
    this.udpService = UdpService.getInstance();
    
    // Initialize will happen in the init() method
  }
  
  async init(): Promise<void> {
    // Ordered initialization with proper error handling
    try {
      // 1. Initialize UDP first
      await this.udpService.initialize();
      
      // 2. Initialize QUIC after UDP
      this.quicService = QuicService.getInstance(this.udpService);
      await this.quicService.initialize();
      
      // 3. Initialize Device Discovery last
      const discoveryOptions = {
        discoveryPort: 49497,
        discoveryInterval: 5000,
        // other options
      };
      this.deviceDiscoveryService = DeviceDiscoveryService.getInstance(
        this.quicService,
        discoveryOptions
      );
      await this.deviceDiscoveryService.initialize();
    } catch (error) {
      console.error('[AppModel] Network services initialization failed:', error);
      // Handle errors but continue app initialization
    }
    
    // Continue with other initializations
  }
  
  // Lifecycle management
  shutdown(): void {
    // Proper shutdown sequence (reverse order of initialization)
    try {
      if (this.deviceDiscoveryService?.isInitialized()) {
        this.deviceDiscoveryService.shutdown();
      }
      
      if (this.quicService?.isInitialized()) {
        this.quicService.shutdown();
      }
      
      if (this.udpService?.isInitialized()) {
        this.udpService.shutdown();
      }
    } catch (error) {
      console.error('[AppModel] Error during shutdown:', error);
    }
  }
}
```

## Implementation Timeline

### Phase 1 (UDP Layer)
- Estimated time: 1-2 days
- Files to modify:
  - Create src/services/network/UdpService.ts
  - Create src/services/network/types.ts
  - Modify src/models/quic/UDPManager.ts (deprecate)
  - Modify src/models/quic/UDPSingleton.ts (deprecate)

### Phase 2 (QUIC Layer)
- Estimated time: 1-2 days
- Files to modify:
  - Create src/services/network/QuicService.ts
  - Modify src/models/quic/QuicModel.ts (deprecate)

### Phase 3 (Device Discovery)
- Estimated time: 1 day
- Files to modify:
  - Create src/services/network/DeviceDiscoveryService.ts
  - Modify src/models/device/DeviceDiscoveryManager.ts (deprecate)

### Phase 4 (Integration)
- Estimated time: 1 day
- Files to modify:
  - Modify src/models/AppModel.ts
  - Update any other components that directly use these services

## Migration Strategy

1. Implement new services alongside existing ones
2. Gradually transition consumers to new services
3. Add deprecation warnings to old implementations
4. Remove old implementations after transition period

## Testing Strategy

1. Unit tests for each service
2. Integration tests for service interactions
3. End-to-end tests for device discovery
4. Error scenario testing
5. Compatibility testing 