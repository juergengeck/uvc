#!/usr/bin/env node

/**
 * Standalone MCP Server
 * 
 * This can be run as a separate process to provide MCP access to the LAMA app
 * Usage: npx @modelcontextprotocol/inspector electron/mcp-server.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// Create the MCP server
const server = new Server(
  {
    name: 'lama-mcp',
    version: '1.0.0',
    description: 'MCP interface for LAMA messaging app'
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// Define available tools
const tools = [
  {
    name: 'send_message',
    description: 'Send a message to the LAMA app',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to send'
        },
        topicId: {
          type: 'string',
          description: 'Optional topic ID'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'get_topics',
    description: 'Get list of available topics',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_messages',
    description: 'Get recent messages',
    inputSchema: {
      type: 'object',
      properties: {
        topicId: {
          type: 'string',
          description: 'Topic ID to get messages from'
        },
        limit: {
          type: 'number',
          description: 'Number of messages to retrieve',
          default: 10
        }
      }
    }
  }
];

// Handle tool listing
server.setRequestHandler('tools/list', async () => {
  console.error('[MCP Server] Listing tools');
  return { tools };
});

// Handle tool execution
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[MCP Server] Executing tool: ${name}`, args);
  
  try {
    let result;
    
    switch (name) {
      case 'send_message':
        // In a real implementation, this would communicate with the Electron app
        result = {
          success: true,
          message: 'Message sent to LAMA app',
          content: args.message
        };
        break;
        
      case 'get_topics':
        // Mock data for demonstration
        result = {
          topics: [
            { id: 'topic1', name: 'General Chat' },
            { id: 'topic2', name: 'AI Assistant' },
            { id: 'topic3', name: 'MCP Communication' }
          ]
        };
        break;
        
      case 'get_messages':
        // Mock data for demonstration
        result = {
          messages: [
            { 
              id: 'msg1', 
              content: 'Hello from LAMA!', 
              sender: 'system',
              timestamp: new Date().toISOString()
            },
            {
              id: 'msg2',
              content: 'This is a test message',
              sender: 'user',
              timestamp: new Date().toISOString()
            }
          ]
        };
        break;
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error('[MCP Server] Error:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Handle resource listing
server.setRequestHandler('resources/list', async () => {
  console.error('[MCP Server] Listing resources');
  
  return {
    resources: [
      {
        uri: 'lama://topics',
        name: 'Topics',
        description: 'List of chat topics',
        mimeType: 'application/json'
      },
      {
        uri: 'lama://messages',
        name: 'Messages',
        description: 'Recent messages',
        mimeType: 'application/json'
      }
    ]
  };
});

// Handle resource reading
server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;
  console.error(`[MCP Server] Reading resource: ${uri}`);
  
  let content;
  
  switch (uri) {
    case 'lama://topics':
      content = {
        topics: [
          { id: 'topic1', name: 'General Chat' },
          { id: 'topic2', name: 'AI Assistant' }
        ]
      };
      break;
      
    case 'lama://messages':
      content = {
        messages: [
          { content: 'Test message 1' },
          { content: 'Test message 2' }
        ]
      };
      break;
      
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
  
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2)
      }
    ]
  };
});

// Start the server
async function main() {
  console.error('[MCP Server] Starting LAMA MCP Server...');
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('[MCP Server] Server running. Ready for MCP connections.');
  console.error('[MCP Server] Use with: npx @modelcontextprotocol/inspector electron/mcp-server.js');
}

main().catch(error => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});