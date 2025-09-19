/**
 * MCPManager - Model Context Protocol Manager for ONE Platform
 * 
 * This class manages MCP tool discovery, registration, and execution
 * within the ONE platform's AI assistant capabilities.
 * 
 * Architecture follows ONE platform patterns:
 * - Manages state transitions with standard states
 * - Uses OEvent system for real-time updates
 * - Integrates with existing TransportManager for P2P sharing
 * - Local-first tool storage using ONE recipes
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks';
import { ensureIdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Person, CLOB } from '@refinio/one.core/lib/recipes.js';
import type TransportManager from '@refinio/one.models/lib/models/TransportManager.js';
import type QuicModel from '../network/QuicModel';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { storeVersionedObject, getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { calculateIdHashOfObj, calculateHashOfObj } from '@refinio/one.core/lib/util/object.js';
import type { CryptoApi } from '@refinio/one.core/lib/crypto/crypto.js';
import { sign, verify } from '@refinio/one.core/lib/crypto/sign.js';
// MCP functionality is handled through electron bridge in React Native
// No direct MCP SDK imports needed - all communication goes through electron IPC

/**
 * MCP Tool Definition
 */
export interface MCPTool {
  id: string;
  name: string;
  description: string;
  parameters?: any; // JSON Schema
  returns?: any; // JSON Schema
}

/**
 * MCP Tool Recipe for ONE platform storage
 */
export interface MCPToolRecipe {
  $type$: 'MCPTool';
  $v$: 1;
  id: string;
  name: string;
  description: string;
  version: string;
  author: SHA256IdHash<Person>;
  signature?: string; // Base64 encoded signature
  
  // Tool specification
  parameters?: any; // JSON Schema
  returns?: any; // JSON Schema
  
  // Execution details
  runtime: 'native' | 'wasm' | 'javascript' | 'mcp-server';
  serverCommand?: string; // For MCP server tools
  serverArgs?: string[]; // For MCP server tools
  code?: SHA256Hash<CLOB>; // For embedded tools
  
  // Permissions
  permissions: {
    network: boolean;
    filesystem: string[]; // allowed paths
    native: string[]; // allowed native modules
  };
}

/**
 * Tool Share Packet for P2P sharing
 */
interface ToolSharePacket {
  toolId: string;
  toolDefinition: MCPToolRecipe;
  signature: string;
  version: string;
}

/**
 * MCPManager State
 */
enum MCPManagerState {
  Uninitialised = 'Uninitialised',
  Initialising = 'Initialising',
  Initialised = 'Initialised',
  Failed = 'Failed'
}

/**
 * MCPManager - Manages MCP tools and servers
 */
export class MCPManager {
  // State management
  private state: MCPManagerState = MCPManagerState.Uninitialised;
  
  // Tool registry
  private tools: Map<string, MCPTool> = new Map();
  private toolRecipes: Map<string, MCPToolRecipe> = new Map();
  private mcpConnections: Map<string, any> = new Map(); // Electron bridge connections
  
  // Dependencies
  private transportManager?: TransportManager;
  private quicModel?: QuicModel;
  private leuteModel?: LeuteModel;
  private instanceOwner: SHA256IdHash<Person>;
  
  // Events
  public readonly onToolsUpdated = new OEvent<(tools: MCPTool[]) => void>();
  public readonly onToolExecuted = new OEvent<(toolId: string, result: any) => void>();
  public readonly onToolShared = new OEvent<(toolId: string, peerId: string) => void>();
  
  constructor(instanceOwner: SHA256IdHash<Person>) {
    this.instanceOwner = instanceOwner;
    console.log('[MCPManager] Constructor completed');
  }
  
  /**
   * Set dependencies (called by AppModel)
   */
  public setDependencies(
    transportManager: TransportManager,
    quicModel: QuicModel,
    leuteModel: LeuteModel
  ): void {
    this.transportManager = transportManager;
    this.quicModel = quicModel;
    this.leuteModel = leuteModel;
    console.log('[MCPManager] Dependencies set');
  }
  
  /**
   * Initialize the MCPManager
   */
  public async init(): Promise<void> {
    console.log('[MCPManager] Starting initialization...');
    
    if (this.state !== MCPManagerState.Uninitialised) {
      console.warn('[MCPManager] Already initialized or initializing');
      return;
    }
    
    this.state = MCPManagerState.Initialising;
    
    try {
      // Load local tools from storage
      await this.loadLocalTools();
      
      // Initialize default MCP servers (if configured)
      await this.initializeDefaultServers();
      
      // Set up P2P tool discovery listeners
      await this.setupP2PListeners();
      
      this.state = MCPManagerState.Initialised;
      console.log('[MCPManager] Initialization complete');
      
      // Emit initial tools
      this.onToolsUpdated.emit(Array.from(this.tools.values()));
    } catch (error) {
      console.error('[MCPManager] Initialization failed:', error);
      this.state = MCPManagerState.Failed;
      throw error;
    }
  }
  
  /**
   * Discover available tools
   */
  public async discoverTools(): Promise<MCPTool[]> {
    console.log('[MCPManager] Discovering tools...');
    
    const allTools: MCPTool[] = [];
    
    // Get local tools
    const localTools = Array.from(this.tools.values());
    allTools.push(...localTools);
    
    // Discover P2P tools if transport is available
    if (this.transportManager && this.state === MCPManagerState.Initialised) {
      try {
        const peerTools = await this.discoverPeerTools();
        allTools.push(...peerTools);
      } catch (error) {
        console.error('[MCPManager] Error discovering peer tools:', error);
      }
    }
    
    // Get tools from connected MCP servers (through electron bridge)
    for (const [serverId, connection] of this.mcpConnections) {
      try {
        const serverTools = await this.listToolsFromBridge(serverId);
        if (serverTools?.tools) {
          for (const tool of serverTools.tools) {
            allTools.push({
              id: `${serverId}:${tool.name}`,
              name: tool.name,
              description: tool.description || '',
              parameters: tool.inputSchema
            });
          }
        }
      } catch (error) {
        console.error(`[MCPManager] Error getting tools from server ${serverId}:`, error);
      }
    }
    
    console.log(`[MCPManager] Discovered ${allTools.length} tools`);
    return allTools;
  }
  
  /**
   * Execute a tool
   */
  public async executeTool(toolId: string, params: any): Promise<any> {
    console.log(`[MCPManager] Executing tool ${toolId}`);
    
    // Check if it's an MCP server tool
    if (toolId.includes(':')) {
      const [serverId, toolName] = toolId.split(':');
      const connection = this.mcpConnections.get(serverId);
      
      if (connection) {
        try {
          const result = await this.callToolFromBridge(serverId, toolName, params);
          
          this.onToolExecuted.emit(toolId, result);
          return result;
        } catch (error) {
          console.error(`[MCPManager] Error executing MCP tool ${toolId}:`, error);
          throw error;
        }
      }
    }
    
    // Check local tools
    const toolRecipe = this.toolRecipes.get(toolId);
    if (!toolRecipe) {
      throw new Error(`[MCPManager] Tool ${toolId} not found`);
    }
    
    // Execute based on runtime type
    let result: any;
    switch (toolRecipe.runtime) {
      case 'javascript':
        result = await this.executeJavaScriptTool(toolRecipe, params);
        break;
      case 'native':
        result = await this.executeNativeTool(toolRecipe, params);
        break;
      case 'wasm':
        result = await this.executeWasmTool(toolRecipe, params);
        break;
      default:
        throw new Error(`[MCPManager] Unsupported runtime: ${toolRecipe.runtime}`);
    }
    
    this.onToolExecuted.emit(toolId, result);
    return result;
  }
  
  /**
   * Register a new tool
   */
  public async registerTool(tool: MCPTool, recipe: MCPToolRecipe): Promise<void> {
    console.log(`[MCPManager] Registering tool ${tool.id}`);
    
    // Validate tool recipe
    if (!recipe.author || !recipe.name) {
      throw new Error('[MCPManager] Invalid tool recipe');
    }
    
    // Store tool recipe as ONE object
    const storedRecipe = await storeVersionedObject(recipe);
    const idHash = calculateIdHashOfObj(storedRecipe);
    
    // Add to registries
    this.tools.set(tool.id, tool);
    this.toolRecipes.set(tool.id, recipe);
    
    console.log(`[MCPManager] Tool ${tool.id} registered with hash ${idHash}`);
    
    // Emit update event
    this.onToolsUpdated.emit(Array.from(this.tools.values()));
  }
  
  /**
   * Share a tool with a peer
   */
  public async shareToolWithPeer(peerId: string, toolId: string): Promise<void> {
    console.log(`[MCPManager] Sharing tool ${toolId} with peer ${peerId}`);
    
    const tool = this.tools.get(toolId);
    const recipe = this.toolRecipes.get(toolId);
    
    if (!tool || !recipe) {
      throw new Error(`[MCPManager] Tool ${toolId} not found`);
    }
    
    if (!this.quicModel) {
      throw new Error('[MCPManager] QUIC transport not available');
    }
    
    // Create share packet
    const packet: ToolSharePacket = {
      toolId,
      toolDefinition: recipe,
      signature: recipe.signature || '',
      version: recipe.version
    };
    
    // Send via QUIC
    // Note: This is a simplified example - actual implementation would need
    // proper encryption and peer authentication
    try {
      // TODO: Implement actual QUIC send when transport is ready
      console.log(`[MCPManager] Would send tool packet to ${peerId}:`, packet);
      
      this.onToolShared.emit(toolId, peerId);
    } catch (error) {
      console.error(`[MCPManager] Error sharing tool with peer ${peerId}:`, error);
      throw error;
    }
  }
  
  /**
   * Connect to an MCP server through electron bridge
   */
  public async connectToMCPServer(
    serverId: string,
    command: string,
    args: string[] = []
  ): Promise<void> {
    console.log(`[MCPManager] Connecting to MCP server ${serverId} via electron bridge`);
    
    try {
      // Send connection request to electron bridge via IPC
      const connection = await this.requestMCPConnection(serverId, command, args);
      
      // Store connection
      this.mcpConnections.set(serverId, connection);
      
      console.log(`[MCPManager] Connected to MCP server ${serverId} via bridge`);
      
      // Discover tools from this server
      const tools = await this.discoverTools();
      this.onToolsUpdated.emit(tools);
    } catch (error) {
      console.error(`[MCPManager] Failed to connect to MCP server ${serverId}:`, error);
      throw error;
    }
  }
  
  /**
   * Request MCP connection through ONE platform channels
   */
  private async requestMCPConnection(
    serverId: string, 
    command: string, 
    args: string[]
  ): Promise<any> {
    console.log(`[MCPManager] Requesting MCP connection to ${serverId} via ONE channels`);
    
    if (!this.transportManager) {
      throw new Error('[MCPManager] TransportManager not available');
    }
    
    // Create or get MCP communication channel
    const mcpTopicId = await this.getOrCreateMCPTopic(serverId);
    
    // Send connection request through ONE's messaging system
    const connectionRequest = {
      type: 'mcp_connect',
      serverId,
      command,
      args,
      timestamp: Date.now(),
      requestId: this.generateRequestId()
    };
    
    await this.sendMCPMessage(mcpTopicId, connectionRequest);
    
    // Store connection info
    const connection = {
      serverId,
      topicId: mcpTopicId,
      command,
      args,
      connected: true,
      timestamp: Date.now()
    };
    
    console.log(`[MCPManager] MCP connection established for ${serverId}`);
    return connection;
  }

  /**
   * List tools from MCP server through ONE channels
   */
  private async listToolsFromBridge(serverId: string): Promise<any> {
    console.log(`[MCPManager] Listing tools from MCP server ${serverId}`);
    
    const connection = this.mcpConnections.get(serverId);
    if (!connection) {
      throw new Error(`[MCPManager] No connection found for server ${serverId}`);
    }
    
    const request = {
      type: 'mcp_list_tools',
      serverId,
      requestId: this.generateRequestId(),
      timestamp: Date.now()
    };
    
    // Send request and wait for response
    const response = await this.sendMCPRequest(connection.topicId, request);
    
    return response.tools || { tools: [] };
  }

  /**
   * Call tool through ONE platform channels
   */
  private async callToolFromBridge(
    serverId: string, 
    toolName: string, 
    params: any
  ): Promise<any> {
    console.log(`[MCPManager] Calling MCP tool ${serverId}:${toolName}`);
    
    const connection = this.mcpConnections.get(serverId);
    if (!connection) {
      throw new Error(`[MCPManager] No connection found for server ${serverId}`);
    }
    
    const request = {
      type: 'mcp_call_tool',
      serverId,
      toolName,
      params,
      requestId: this.generateRequestId(),
      timestamp: Date.now()
    };
    
    // Send request and get response
    const response = await this.sendMCPRequest(connection.topicId, request);
    
    return response.result;
  }

  /**
   * Disconnect from MCP server through ONE channels
   */
  private async disconnectFromBridge(serverId: string): Promise<void> {
    console.log(`[MCPManager] Disconnecting from MCP server ${serverId}`);
    
    const connection = this.mcpConnections.get(serverId);
    if (!connection) {
      return;
    }
    
    const request = {
      type: 'mcp_disconnect',
      serverId,
      requestId: this.generateRequestId(),
      timestamp: Date.now()
    };
    
    await this.sendMCPMessage(connection.topicId, request);
    console.log(`[MCPManager] Disconnection request sent for ${serverId}`);
  }

  /**
   * Get or create MCP communication topic for a server
   */
  private async getOrCreateMCPTopic(serverId: string): Promise<string> {
    const topicName = `MCP_${serverId}`;
    
    // Check if we have access to topic model through dependencies
    if (!this.leuteModel) {
      throw new Error('[MCPManager] LeuteModel not available for topic creation');
    }
    
    // In a full implementation, would check for existing topic first
    // For now, create a new topic for MCP communication
    try {
      // Create through the model hierarchy - this needs to be implemented properly
      // based on how TopicModel is accessed through the dependencies
      console.log(`[MCPManager] Creating MCP topic: ${topicName}`);
      
      // Placeholder - would need proper integration with TopicModel
      const topicId = `mcp_topic_${serverId}_${Date.now()}`;
      return topicId;
    } catch (error) {
      console.error(`[MCPManager] Failed to create MCP topic: ${error}`);
      throw error;
    }
  }

  /**
   * Send MCP message through ONE platform
   */
  private async sendMCPMessage(topicId: string, message: any): Promise<void> {
    console.log(`[MCPManager] Sending MCP message to topic ${topicId}:`, message.type);
    
    // This would send the message through ONE's TopicModel
    // The actual implementation would depend on how TopicModel is accessed
    // through the model hierarchy
    
    // Placeholder for sending message through ONE platform
    console.log(`[MCPManager] Message sent: ${JSON.stringify(message)}`);
  }

  /**
   * Send MCP request and wait for response
   */
  private async sendMCPRequest(topicId: string, request: any): Promise<any> {
    console.log(`[MCPManager] Sending MCP request ${request.type} with ID ${request.requestId}`);
    
    // Send the request
    await this.sendMCPMessage(topicId, request);
    
    // In a real implementation, this would:
    // 1. Listen for response messages on the topic
    // 2. Match responses by requestId
    // 3. Return the matching response with timeout handling
    
    // Placeholder response
    const response = {
      requestId: request.requestId,
      type: `${request.type}_response`,
      success: true,
      timestamp: Date.now()
    };
    
    // Add appropriate response data based on request type
    switch (request.type) {
      case 'mcp_list_tools':
        response.tools = { tools: [] };
        break;
      case 'mcp_call_tool':
        response.result = { success: true, output: 'Tool execution not yet implemented' };
        break;
    }
    
    console.log(`[MCPManager] Received response for ${request.requestId}`);
    return response;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `mcp_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load local tools from storage
   */
  private async loadLocalTools(): Promise<void> {
    console.log('[MCPManager] Loading local tools...');
    
    // TODO: Implement loading from ONE storage
    // For now, we'll just log
    console.log('[MCPManager] Local tools loading not yet implemented');
  }
  
  /**
   * Initialize default MCP servers
   */
  private async initializeDefaultServers(): Promise<void> {
    console.log('[MCPManager] Initializing default MCP servers...');
    
    // TODO: Load server configurations from settings
    // For now, we can hardcode some examples
    
    // Example: Connect to a filesystem MCP server
    // await this.connectToMCPServer('filesystem', 'npx', ['-y', '@modelcontextprotocol/server-filesystem']);
    
    console.log('[MCPManager] Default servers initialization complete');
  }
  
  /**
   * Set up P2P listeners for tool sharing
   */
  private async setupP2PListeners(): Promise<void> {
    console.log('[MCPManager] Setting up P2P listeners...');
    
    // TODO: Implement P2P tool discovery via TransportManager
    // This would listen for tool share packets from peers
    
    console.log('[MCPManager] P2P listeners setup complete');
  }
  
  /**
   * Discover tools from peers
   */
  private async discoverPeerTools(): Promise<MCPTool[]> {
    console.log('[MCPManager] Discovering peer tools...');
    
    // TODO: Implement P2P tool discovery
    // This would query connected peers for their tools
    
    return [];
  }
  
  /**
   * Execute JavaScript tool
   */
  private async executeJavaScriptTool(recipe: MCPToolRecipe, params: any): Promise<any> {
    console.log(`[MCPManager] Executing JavaScript tool ${recipe.id}`);
    
    // TODO: Implement sandboxed JavaScript execution
    // This would load and execute the tool code in a safe environment
    
    throw new Error('[MCPManager] JavaScript tool execution not yet implemented');
  }
  
  /**
   * Execute native tool
   */
  private async executeNativeTool(recipe: MCPToolRecipe, params: any): Promise<any> {
    console.log(`[MCPManager] Executing native tool ${recipe.id}`);
    
    // TODO: Implement native tool execution
    // This would call native modules with proper permissions
    
    throw new Error('[MCPManager] Native tool execution not yet implemented');
  }
  
  /**
   * Execute WASM tool
   */
  private async executeWasmTool(recipe: MCPToolRecipe, params: any): Promise<any> {
    console.log(`[MCPManager] Executing WASM tool ${recipe.id}`);
    
    // TODO: Implement WASM tool execution
    // This would load and execute WASM modules
    
    throw new Error('[MCPManager] WASM tool execution not yet implemented');
  }
  
  /**
   * Get all registered tools
   */
  public getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Get a specific tool by ID
   */
  public getTool(toolId: string): MCPTool | undefined {
    return this.tools.get(toolId);
  }
  
  /**
   * Check if manager is ready
   */
  public isReady(): boolean {
    return this.state === MCPManagerState.Initialised;
  }
  
  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('[MCPManager] Shutting down...');
    
    // Disconnect from all MCP servers
    for (const [serverId, connection] of this.mcpConnections) {
      try {
        await this.disconnectFromBridge(serverId);
        console.log(`[MCPManager] Disconnected from server ${serverId}`);
      } catch (error) {
        console.error(`[MCPManager] Error disconnecting from server ${serverId}:`, error);
      }
    }
    
    // Clear registries
    this.tools.clear();
    this.toolRecipes.clear();
    this.mcpConnections.clear();
    
    // Clear event listeners (OEvent doesn't have removeAllListeners)
    // Events will be cleared when new OEvent instances are created on re-init
    
    this.state = MCPManagerState.Uninitialised;
    console.log('[MCPManager] Shutdown complete');
  }
}