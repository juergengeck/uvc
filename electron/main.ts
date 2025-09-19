/**
 * Electron Main Process
 * 
 * Runs the LAMA app in Electron with MCP Bridge support
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { MCPBridgeServer } from './mcp-bridge/MCPBridgeServer';

let mainWindow: BrowserWindow | null = null;
let mcpBridge: MCPBridgeServer | null = null;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Enable loading the React Native web build
      webSecurity: false
    },
    title: 'LAMA - Desktop'
  });

  // Load the app - could be either:
  // 1. Local development server (Metro bundler web build)
  // 2. Production build
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:8081'); // Metro bundler web
  } else {
    mainWindow.loadFile(path.join(__dirname, '../web-build/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize the app with MCP Bridge
 */
async function initializeApp() {
  // Wait for the app to be ready
  await app.whenReady();
  
  console.log('[Electron] App ready, creating window...');
  createWindow();
  
  // Initialize the core app logic
  // This would be the same initialization as in React Native
  console.log('[Electron] Initializing app core...');
  
  try {
    // Import and initialize the app model
    // Note: This needs to be adapted to work in Node.js environment
    const { initModel } = await import('../src/initialization/index');
    const appModel = await initModel();
    
    // Create and start MCP Bridge
    console.log('[Electron] Starting MCP Bridge...');
    mcpBridge = new MCPBridgeServer(appModel);
    await mcpBridge.start();
    
    console.log('[Electron] MCP Bridge is ready for connections');
    console.log('[Electron] You can now connect MCP clients to this app');
    
    // Make the bridge available to renderer process if needed
    (global as any).mcpBridge = mcpBridge;
    (global as any).appModel = appModel;
    
  } catch (error) {
    console.error('[Electron] Failed to initialize:', error);
  }
}

// App event handlers
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  // Stop MCP Bridge before quitting
  if (mcpBridge) {
    console.log('[Electron] Stopping MCP Bridge...');
    await mcpBridge.stop();
  }
});

// Start the application
initializeApp().catch(error => {
  console.error('[Electron] Fatal error during initialization:', error);
  app.quit();
});