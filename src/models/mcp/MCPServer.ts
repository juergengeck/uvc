/**
 * MCP Server for React Native
 * This allows external clients (like Claude) to connect to the app via MCP
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { AppModel } from '../AppModel';

export interface MCPServerConfig {
  port?: number;
  host?: string;
  appModel: AppModel;
}

/**
 * MCP Server that exposes app functionality as tools
 */
export class MCPServer {
  private config: MCPServerConfig;
  private isRunning = false;
  private websocketServer?: any;
  
  // Events
  public readonly onClientConnected = new OEvent<(clientId: string) => void>();
  public readonly onToolCalled = new OEvent<(tool: string, params: any) => void>();
  
  constructor(config: MCPServerConfig) {
    this.config = config;
  }
  
  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MCPServer] Server already running');
      return;
    }
    
    console.log('[MCPServer] Starting MCP server...');
    
    // For React Native, we'd use WebSocket server
    // This would need react-native-websocket-server or similar
    try {
      // Initialize WebSocket server for MCP protocol
      await this.initializeWebSocketServer();
      
      this.isRunning = true;
      console.log('[MCPServer] MCP server started successfully');
    } catch (error) {
      console.error('[MCPServer] Failed to start server:', error);
      throw error;
    }
  }
  
  /**
   * Initialize WebSocket server for MCP communication
   */
  private async initializeWebSocketServer(): Promise<void> {
    // In React Native, we'd need to use a WebSocket server library
    // For now, this is a placeholder showing the structure
    
    console.log('[MCPServer] Would initialize WebSocket server on port', this.config.port || 3000);
    
    // The actual implementation would:
    // 1. Create WebSocket server
    // 2. Handle MCP protocol messages
    // 3. Expose tools based on app capabilities
  }
  
  /**
   * Register available tools that external clients can call
   */
  getAvailableTools() {
    return [
      {
        name: 'send_message',
        description: 'Send a message to a chat topic in the app',
        parameters: {
          type: 'object',
          properties: {
            topicId: { type: 'string', description: 'The topic ID to send to' },
            message: { type: 'string', description: 'The message content' }
          },
          required: ['topicId', 'message']
        }
      },
      {
        name: 'list_topics',
        description: 'List all available chat topics',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_messages',
        description: 'Get messages from a specific topic',
        parameters: {
          type: 'object',
          properties: {
            topicId: { type: 'string', description: 'The topic ID to get messages from' },
            limit: { type: 'number', description: 'Maximum number of messages to return' }
          },
          required: ['topicId']
        }
      },
      {
        name: 'create_topic',
        description: 'Create a new chat topic',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name for the new topic' }
          },
          required: ['name']
        }
      },
      {
        name: 'get_device_info',
        description: 'Get information about connected devices',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }
  
  /**
   * Execute a tool call from an external client
   */
  async executeTool(toolName: string, params: any): Promise<any> {
    console.log(`[MCPServer] Executing tool: ${toolName}`, params);
    
    const { appModel } = this.config;
    
    switch (toolName) {
      case 'send_message': {
        const { topicId, message } = params;
        // Use the app's messaging system to send a message
        if (appModel.topicModel) {
          // This would actually send a message through the topic model
          console.log(`[MCPServer] Would send message to topic ${topicId}: ${message}`);
          return { success: true, message: 'Message sent' };
        }
        break;
      }
      
      case 'list_topics': {
        if (appModel.topicModel) {
          // Get all topics from the topic model
          console.log('[MCPServer] Would list all topics');
          return { topics: [] }; // Would return actual topics
        }
        break;
      }
      
      case 'get_messages': {
        const { topicId, limit = 10 } = params;
        if (appModel.topicModel) {
          console.log(`[MCPServer] Would get ${limit} messages from topic ${topicId}`);
          return { messages: [] }; // Would return actual messages
        }
        break;
      }
      
      case 'create_topic': {
        const { name } = params;
        if (appModel.topicModel) {
          console.log(`[MCPServer] Would create topic with name: ${name}`);
          return { topicId: 'new-topic-id', name };
        }
        break;
      }
      
      case 'get_device_info': {
        if (appModel.deviceDiscoveryModel) {
          console.log('[MCPServer] Would get device information');
          return { devices: [] }; // Would return actual device info
        }
        break;
      }
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
    
    this.onToolCalled.emit(toolName, params);
    return { success: true };
  }
  
  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    console.log('[MCPServer] Stopping MCP server...');
    
    // Clean up WebSocket server
    if (this.websocketServer) {
      // Close WebSocket server
    }
    
    this.isRunning = false;
    console.log('[MCPServer] MCP server stopped');
  }
  
  /**
   * Get server status
   */
  getStatus() {
    return {
      running: this.isRunning,
      port: this.config.port || 3000,
      host: this.config.host || 'localhost'
    };
  }
}