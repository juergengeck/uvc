/**
 * MCP Bridge Server for Electron
 * 
 * This runs in the Electron app and provides a full MCP server
 * that external clients (like Claude) can connect to.
 * It bridges MCP requests to the app's core logic.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  Tool,
  TextContent,
  ImageContent,
  EmbeddedResource
} from '@modelcontextprotocol/sdk/types.js';
import type { AppModel } from '../../src/models/AppModel';

/**
 * MCP Bridge Server that runs in Electron
 */
export class MCPBridgeServer {
  private server: Server;
  private appModel: AppModel;
  private isRunning = false;

  constructor(appModel: AppModel) {
    this.appModel = appModel;
    
    // Initialize MCP server with app metadata
    this.server = new Server(
      {
        name: 'lama-mcp-bridge',
        version: '1.0.0',
        description: 'MCP Bridge for LAMA messaging app'
      },
      {
        capabilities: {
          tools: {
            list: true,
            call: true
          },
          resources: {
            list: true,
            read: true
          }
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up MCP protocol handlers
   */
  private setupHandlers() {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log('[MCPBridge] Listing available tools');
      
      const tools: Tool[] = [
        {
          name: 'send_message',
          description: 'Send a message to a chat topic',
          inputSchema: {
            type: 'object',
            properties: {
              topicId: { 
                type: 'string', 
                description: 'The topic ID to send the message to'
              },
              message: { 
                type: 'string', 
                description: 'The message content to send'
              }
            },
            required: ['message']
          }
        },
        {
          name: 'list_topics',
          description: 'List all available chat topics',
          inputSchema: {
            type: 'object',
            properties: {
              includeAI: {
                type: 'boolean',
                description: 'Include AI assistant topics',
                default: true
              }
            }
          }
        },
        {
          name: 'get_messages',
          description: 'Get recent messages from a topic',
          inputSchema: {
            type: 'object',
            properties: {
              topicId: { 
                type: 'string', 
                description: 'The topic ID to get messages from'
              },
              limit: { 
                type: 'number', 
                description: 'Maximum number of messages to return',
                default: 20
              }
            },
            required: ['topicId']
          }
        },
        {
          name: 'create_topic',
          description: 'Create a new chat topic',
          inputSchema: {
            type: 'object',
            properties: {
              name: { 
                type: 'string', 
                description: 'Name for the new topic'
              },
              withAI: {
                type: 'boolean',
                description: 'Add AI assistant to the topic',
                default: false
              }
            },
            required: ['name']
          }
        },
        {
          name: 'get_contacts',
          description: 'Get list of contacts',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get_devices',
          description: 'Get list of discovered devices',
          inputSchema: {
            type: 'object',
            properties: {
              onlyOnline: {
                type: 'boolean',
                description: 'Only return currently online devices',
                default: false
              }
            }
          }
        },
        {
          name: 'execute_ai_task',
          description: 'Execute an AI task in a topic',
          inputSchema: {
            type: 'object',
            properties: {
              topicId: {
                type: 'string',
                description: 'Topic to execute the task in'
              },
              task: {
                type: 'string',
                description: 'The task/prompt for the AI'
              },
              modelId: {
                type: 'string',
                description: 'Optional model ID to use'
              }
            },
            required: ['task']
          }
        }
      ];

      return { tools };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.log(`[MCPBridge] Executing tool: ${name}`, args);

      try {
        const result = await this.executeTool(name, args);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            } as TextContent
          ]
        };
      } catch (error) {
        console.error(`[MCPBridge] Tool execution error:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            } as TextContent
          ],
          isError: true
        };
      }
    });

    // Handle resource listing (topics, messages, etc.)
    this.server.setRequestHandler('resources/list', async () => {
      console.log('[MCPBridge] Listing resources');
      
      const resources: EmbeddedResource[] = [];
      
      // Add topics as resources
      if (this.appModel.topicModel) {
        try {
          const topics = await this.getTopicsList();
          topics.forEach(topic => {
            resources.push({
              uri: `topic://${topic.id}`,
              name: topic.name || `Topic ${topic.id}`,
              description: `Chat topic with ${topic.participantCount || 0} participants`,
              mimeType: 'application/json'
            });
          });
        } catch (error) {
          console.error('[MCPBridge] Error listing topics:', error);
        }
      }

      return { resources };
    });

    // Handle resource reading
    this.server.setRequestHandler('resources/read', async (request: any) => {
      const { uri } = request.params;
      console.log(`[MCPBridge] Reading resource: ${uri}`);

      if (uri.startsWith('topic://')) {
        const topicId = uri.replace('topic://', '');
        const messages = await this.getTopicMessages(topicId, 50);
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(messages, null, 2)
            }
          ]
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  /**
   * Execute a tool with the app model
   */
  private async executeTool(toolName: string, params: any): Promise<any> {
    const { appModel } = this;

    switch (toolName) {
      case 'send_message': {
        const { topicId, message } = params;
        
        // If no topicId provided, use or create a default topic
        let targetTopicId = topicId;
        if (!targetTopicId) {
          // Get or create a default MCP communication topic
          targetTopicId = await this.getOrCreateDefaultTopic();
        }

        // Send message through the topic model
        if (appModel.topicModel) {
          const room = await appModel.topicModel.enterTopicRoom(targetTopicId);
          if (room && typeof (room as any).sendMessage === 'function') {
            await (room as any).sendMessage(message);
            return { 
              success: true, 
              topicId: targetTopicId,
              message: 'Message sent successfully'
            };
          }
        }
        
        throw new Error('Could not send message - topic model not available');
      }

      case 'list_topics': {
        const { includeAI = true } = params;
        const topics = await this.getTopicsList(includeAI);
        return { topics };
      }

      case 'get_messages': {
        const { topicId, limit = 20 } = params;
        const messages = await this.getTopicMessages(topicId, limit);
        return { messages };
      }

      case 'create_topic': {
        const { name, withAI = false } = params;
        
        if (appModel.topicModel) {
          const topicId = await appModel.topicModel.createGroupTopic(name);
          
          // If requested, add AI assistant to the topic
          if (withAI && appModel.aiAssistantModel) {
            // This would add an AI participant to the topic
            console.log(`[MCPBridge] Would add AI assistant to topic ${topicId}`);
          }
          
          return { 
            success: true,
            topicId,
            name 
          };
        }
        
        throw new Error('Topic model not available');
      }

      case 'get_contacts': {
        if (appModel.leuteModel) {
          const contacts = await appModel.leuteModel.getAllContacts();
          return { 
            contacts: contacts.map(c => ({
              id: c.idHash,
              name: c.name || 'Unknown'
            }))
          };
        }
        
        return { contacts: [] };
      }

      case 'get_devices': {
        const { onlyOnline = false } = params;
        
        if (appModel.deviceDiscoveryModel) {
          const devices = appModel.deviceDiscoveryModel.getDiscoveredDevices();
          const filtered = onlyOnline 
            ? devices.filter(d => appModel.deviceDiscoveryModel?.isDeviceAvailable(d.deviceId))
            : devices;
            
          return { 
            devices: filtered.map(d => ({
              id: d.deviceId,
              name: d.deviceName,
              type: d.deviceType,
              online: appModel.deviceDiscoveryModel?.isDeviceAvailable(d.deviceId)
            }))
          };
        }
        
        return { devices: [] };
      }

      case 'execute_ai_task': {
        const { topicId, task, modelId } = params;
        
        if (appModel.aiAssistantModel) {
          // Get or create topic for AI interaction
          let targetTopicId = topicId;
          if (!targetTopicId) {
            targetTopicId = await this.getOrCreateDefaultTopic();
          }

          // Send the task as a message to trigger AI response
          await this.executeTool('send_message', {
            topicId: targetTopicId,
            message: task
          });

          // Wait a bit for AI to process
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Get the AI's response
          const messages = await this.getTopicMessages(targetTopicId, 5);
          const aiResponse = messages.find(m => m.sender !== 'user');

          return {
            success: true,
            topicId: targetTopicId,
            response: aiResponse?.content || 'AI is processing...'
          };
        }

        throw new Error('AI Assistant not available');
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get list of topics
   */
  private async getTopicsList(includeAI = true): Promise<any[]> {
    if (!this.appModel.topicModel) {
      return [];
    }

    try {
      // Get all topics from the topic model
      const topics = await (this.appModel.topicModel as any).getAllTopics();
      
      return topics.map((topic: any) => ({
        id: topic.id,
        name: topic.name || `Topic ${topic.id}`,
        isAI: this.appModel.aiAssistantModel?.isAITopic(topic.id) || false,
        participantCount: topic.participants?.length || 0
      })).filter((topic: any) => includeAI || !topic.isAI);
    } catch (error) {
      console.error('[MCPBridge] Error getting topics:', error);
      return [];
    }
  }

  /**
   * Get messages from a topic
   */
  private async getTopicMessages(topicId: string, limit: number): Promise<any[]> {
    if (!this.appModel.topicModel) {
      return [];
    }

    try {
      const room = await this.appModel.topicModel.enterTopicRoom(topicId);
      if (room && typeof (room as any).getMessages === 'function') {
        const messages = await (room as any).getMessages(limit);
        
        return messages.map((msg: any) => ({
          id: msg.id,
          content: msg.text || msg.content,
          sender: msg.senderId || 'unknown',
          timestamp: msg.timestamp || Date.now()
        }));
      }
    } catch (error) {
      console.error(`[MCPBridge] Error getting messages for topic ${topicId}:`, error);
    }

    return [];
  }

  /**
   * Get or create a default topic for MCP communication
   */
  private async getOrCreateDefaultTopic(): Promise<string> {
    // Look for existing MCP topic or create one
    const topics = await this.getTopicsList();
    let mcpTopic = topics.find(t => t.name === 'MCP Communication');
    
    if (!mcpTopic) {
      const result = await this.executeTool('create_topic', {
        name: 'MCP Communication',
        withAI: true
      });
      return result.topicId;
    }
    
    return mcpTopic.id;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MCPBridge] Server already running');
      return;
    }

    console.log('[MCPBridge] Starting MCP Bridge Server...');

    try {
      // Create stdio transport for MCP communication
      const transport = new StdioServerTransport();
      
      // Connect the transport to the server
      await this.server.connect(transport);
      
      this.isRunning = true;
      console.log('[MCPBridge] MCP Bridge Server started successfully');
      console.log('[MCPBridge] External clients can now connect via stdio');
    } catch (error) {
      console.error('[MCPBridge] Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[MCPBridge] Stopping MCP Bridge Server...');
    
    await this.server.close();
    
    this.isRunning = false;
    console.log('[MCPBridge] MCP Bridge Server stopped');
  }
}