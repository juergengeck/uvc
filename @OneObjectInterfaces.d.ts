/**
 * Type declarations for ONE object interfaces
 * Following the pattern from one.core to properly integrate with one.core types
 * 
 * IMPORTANT: This is the single source of truth for ONE Object interface declarations.
 * Do not create additional @OneObjectInterfaces.d.ts files elsewhere.
 * 
 * Following one.core pattern: NO IMPORT STATEMENTS in ambient declaration files
 * All types must be declared inline or referenced via triple-slash directives
 */

/// <reference path="./node_modules/@refinio/one.core/lib/recipes.d.ts" />
/// <reference path="./node_modules/@refinio/one.core/lib/util/type-checks.d.ts" />

declare module '@OneObjectInterfaces' {
    // Re-export essential types from one.core for convenience
    export type SHA256Hash = string & { readonly __brand: unique symbol };
    export type SHA256IdHash = string & { readonly __brand: unique symbol };
    
         // AI-related type declarations (inline to avoid import dependencies)
     export interface LLM {
         $type$: 'LLM';
         name: string;
         filename: string;
         modelType: 'local' | 'cloud';
         active: boolean;
         deleted: boolean;
         creator: string;
         created: number;
         modified: number;
         createdAt: string;
         lastUsed: string;
         size: number;
         capabilities: Array<'chat' | 'inference' | 'embedding' | 'functions' | 'tools' | 'rag' | 'vision' | 'multimodal'>;
         lastInitialized: number;
         usageCount: number;
         
         // Model parameters
         temperature?: number;
         maxTokens?: number;
         contextSize?: number;
         batchSize?: number;
         threads?: number;
         mirostat?: number;
         topK?: number;
         topP?: number;
         
         // Thinking and reasoning options
         extractThinking?: boolean;
         reasoningFormat?: string;
         thinkingTagsEnabled?: boolean;
         thinkingSeparatorTokens?: string[];
         
         // Optional properties
         personId?: string | SHA256IdHash;
         architecture?: string;
         contextLength?: number;
         quantization?: string;
         checksum?: string;
         provider?: string;
         downloadUrl?: string;
         modelPath?: string;
         $versionHash$?: string;
     }
    
    export interface LLMSettings {
        $type$: 'LLMSettings';
        name: string;
        llm: SHA256IdHash;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        userPrompt?: string;
        isDefault?: boolean;
    }
    
    export interface GlobalLLMSettings {
        $type$: 'GlobalLLMSettings';
        defaultLLM?: SHA256IdHash;
        defaultSettings?: SHA256IdHash;
        providers: Record<string, any>;
    }
    
    export interface AIProviderConfig {
        $type$: 'AIProviderConfig';
        provider: string;
        apiKey?: string;
        baseUrl?: string;
        models: string[];
        isDefault?: boolean;
    }
    
    export interface AIProcessingStatus {
        $type$: 'AIProcessingStatus';
        status: 'pending' | 'processing' | 'completed' | 'error';
        progress?: number;
        message?: string;
        startTime: number;
        endTime?: number;
    }
    
    export interface AIResponse {
        $type$: 'AIResponse';
        content: string;
        model: string;
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
        finishReason?: string;
        timestamp: number;
    }
    
    export interface LocalAIConfig {
        $type$: 'LocalAIConfig';
        modelPath: string;
        contextLength?: number;
        temperature?: number;
        topK?: number;
        topP?: number;
        repeatPenalty?: number;
        seed?: number;
    }
    
         // Device-related type declarations
     export interface Device {
         $type$: 'Device';
         instance: SHA256IdHash;
         deviceId: string;
         deviceType: string;
         address: string;
         port: number;
         capabilities: string[];
         macAddress?: string;
         serialNumber?: string;
         credentialId?: string;
         hasValidCredential: boolean;
         firmwareVersion?: string;
         firstSeen: number;
         lastSeen: number;
         metadata?: string;
     }
    
         export interface DeviceSettings {
         $type$: 'DeviceSettings';
         forDevice: SHA256IdHash;
         deviceId: string;
         displayName: string;
         isConnected: boolean;
         autoConnect: boolean;
         icon?: string;
         color?: string;
         group?: string;
         notifications: boolean;
         autoUpdate: boolean;
         permissions: string[];
         customFields?: Record<string, any>;
         note?: string;
         lastModified: number;
         modifiedBy?: SHA256IdHash;
     }
    
    export interface VerifiableCredential {
        $type$: 'VerifiableCredential';
        id: string;
        issuer: SHA256IdHash;
        subject: SHA256Hash;
        credentialType: string;
        claims: Map<string, any>;
        issuedAt: number;
        validUntil?: number;
        license: SHA256Hash;
        proof: string;
        revoked?: boolean;
    }
    
    export interface ESP32DataPresentation {
        $type$: 'ESP32DataPresentation';
        deviceId: string;
        data: Record<string, any>;
        timestamp: number;
        format: 'json' | 'binary' | 'text';
    }
    
         export interface DeviceSettingsGroup {
         $type$: 'DeviceSettingsGroup';
         name: string;
         devices: string[];
         settings: Record<string, any>;
         priority?: number;
     }
     
     // AI Assistant metadata
     export interface AIMetadata {
         $type$: 'AIMetadata';
         id: string;
         name: string;
         modelType: string;
         version: string;
         capabilities: string[];
         isLocal: boolean;
         status: 'online' | 'offline';
         lastInitialized: number;
         lastUsed: number;
         usageCount: number;
         someoneId?: SHA256IdHash;
         architecture?: string;
         parameters?: number;
         contextLength?: number;
         quantization?: string;
     }
     
     export interface AICapability {
         $type$: 'AICapability';
         name: string;
         description: string;
         isEnabled: boolean;
         requiresNetwork: boolean;
     }

     // Transport-related type declarations
     export interface TransportConfig {
         $type$: 'TransportConfig';
         name: string;
         transportType: 'comm_server' | 'p2p_udp' | 'ble_direct';
         active: boolean;
         deleted: boolean;
         creator?: string;
         created: number;
         modified: number;
         createdAt: string;
         lastUsed: string;
         
         // Transport-specific configuration
         commServerUrl?: string;
         reconnectInterval?: number;
         maxReconnectAttempts?: number;
         connectionTimeout?: number;
         
         // Performance and reliability settings
         priority?: 'high' | 'medium' | 'low';
         reliability?: 'high' | 'medium' | 'low';
         capabilities?: string[];
         
         // Statistics
         totalConnections?: number;
         connectionFailures?: number;
         averageConnectionTime?: number;
         bytesSent?: number;
         bytesReceived?: number;
         uptime?: number;
     }
     
     export interface ConnectionInstance {
         $type$: 'ConnectionInstance';
         connectionId: string;
         transportConfigId: string;
         remoteEndpoint: string;
         status: 'connecting' | 'connected' | 'disconnected' | 'error';
         targetDeviceId?: string;
         targetPersonId?: SHA256IdHash;
         targetInstanceId?: string;
         targetAddress?: string;
         established: string;
         lastActivity: string;
         created: number;
         modified: number;
         bytesSent: number;
         bytesReceived: number;
         
         // Connection quality metrics
         signalStrength?: number;
         latency?: number;
         bandwidth?: number;
         packetLoss?: number;
         stability?: number;
         quality?: 'excellent' | 'good' | 'fair' | 'poor';
     }

         // Journal-related type declarations
     export interface JournalEntry {
         $type$: 'JournalEntry';
         id: string;
         timestamp: number;
         type: string;
         data: object;
         userId?: string;
     }

     // Organizational structure type declarations
     export interface Organisation {
         $type$: 'Organisation';
         name: string;
         description?: string;
         owner: SHA256IdHash; // Person ID
         created: number;
         modified: number;
         departments?: SHA256IdHash[]; // Department IDs
         settings?: Record<string, any>;
     }

     export interface Department {
         $type$: 'Department';
         name: string;
         description?: string;
         owner: SHA256IdHash; // Person ID
         organisation: SHA256IdHash; // Organisation ID
         created: number;
         modified: number;
         rooms?: SHA256IdHash[]; // Room IDs
         settings?: Record<string, any>;
     }

     export interface Room {
         $type$: 'Room';
         name: string;
         description?: string;
         owner: SHA256IdHash; // Person ID
         department: SHA256IdHash; // Department ID
         created: number;
         modified: number;
         devices?: SHA256IdHash[]; // Device IDs
         settings?: Record<string, any>;
     }

         // ONE.core interface declarations for declaration merging
     interface OneUnversionedObjectInterfaces {
         AIProviderConfig: AIProviderConfig;
         AIProcessingStatus: AIProcessingStatus;
         AIResponse: AIResponse;
         LocalAIConfig: LocalAIConfig;
         ESP32DataPresentation: ESP32DataPresentation;
         DeviceSettingsGroup: DeviceSettingsGroup;
         AIMetadata: AIMetadata;
         AICapability: AICapability;
         JournalEntry: JournalEntry;
         Organisation: Organisation;
         Department: Department;
         Room: Room;
     }
     
     interface OneCertificateInterfaces {
         VerifiableCredential: VerifiableCredential;
     }

         interface OneIdObjectInterfaces {
         GlobalLLMSettings: Pick<GlobalLLMSettings, '$type$'>;
         LLM: Pick<LLM, '$type$' | 'name'>;
         LLMSettings: Pick<LLMSettings, '$type$' | 'name' | 'llm'>;
         Device: Pick<Device, '$type$' | 'instance'>;
         DeviceSettings: Pick<DeviceSettings, '$type$' | 'forDevice'>;
         AIMetadata: Pick<AIMetadata, '$type$' | 'id'>;
         TransportConfig: Pick<TransportConfig, '$type$' | 'name'>;
         ConnectionInstance: Pick<ConnectionInstance, '$type$' | 'connectionId'>;
         Organisation: Pick<Organisation, '$type$' | 'name'>;
         Department: Pick<Department, '$type$' | 'name' | 'organisation'>;
         Room: Pick<Room, '$type$' | 'name' | 'department'>;
     }

         interface OneVersionedObjectInterfaces {
         GlobalLLMSettings: GlobalLLMSettings;
         LLM: LLM;
         LLMSettings: LLMSettings;
         Device: Device;
         DeviceSettings: DeviceSettings;
         AIMetadata: AIMetadata;
         TransportConfig: TransportConfig;
         ConnectionInstance: ConnectionInstance;
         Organisation: Organisation;
         Department: Department;
         Room: Room;
     }
}

// Export the types that are being imported directly
export type { LLM, LLMSettings, GlobalLLMSettings };
export type { AIProviderConfig, AIProcessingStatus, AIResponse, LocalAIConfig };
export type { Device, DeviceSettings, VerifiableCredential, ESP32DataPresentation, DeviceSettingsGroup };
export type { JournalEntry };
export type { Organisation, Department, Room };

// NOTE: The export statement for specific types has been removed.
//       Types should be imported directly from their defining modules.