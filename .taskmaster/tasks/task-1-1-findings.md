# Task 1.1 Findings: Current Plugin Chain Order

## **Current Plugin Chain Architecture**

### **Base Connection Constructor (one.models/Connection.js)**
When a new Connection is created, these plugins are automatically added:
```javascript
this.addPlugin(new WebSocketPlugin(webSocket));  // Plugin 1: WebSocket handling
this.addPlugin(new StatisticsPlugin());          // Plugin 2: Statistics tracking  
this.addPlugin(new NetworkPlugin());             // Plugin 3: Message logging/debugging
```

### **Additional Plugins Added by Connection Factories**
Different connection factories add additional plugins:

#### **WebSocketListener.js:**
```javascript
// After base plugins, adds:
this.connection.addPlugin(new PromisePlugin(), { after: 'websocket' });
```

#### **CommunicationServerConnection_Client.js:**
```javascript
// After base plugins, adds:
this.connection.addPlugin(new PromisePlugin(), { after: 'websocket' });
// And optionally:
this.connection.addPlugin(new PongPlugin(pingInterval, pongTimeout), { before: 'promise' });
```

### **Resulting Plugin Processing Order**
Based on the `{ after: 'websocket' }` directive, the processing order is:
1. **WebSocketPlugin** - Handles raw WebSocket messages, filters ping/pong
2. **PromisePlugin** - Handles JSON parsing and promise-based message waiting
3. **StatisticsPlugin** - Tracks connection statistics
4. **NetworkPlugin** - Logs all messages for debugging (LAST in chain)

## **Current Message Flow**

```
WebSocket Message (e.g., "ping" or '{"command": "communication_request"}')
    │
    ▼
WebSocketPlugin.handleMessage()
    │ (filters ping/pong messages - should stop here for "ping")
    ▼
PromisePlugin.waitForMessage() / waitForJSONMessage()
    │ (tries to parse as JSON - has ping/pong filtering as backup)
    ▼
StatisticsPlugin
    │ (tracks message statistics)
    ▼
NetworkPlugin.handleMessage()
    │ (logs message for debugging - should be last)
    ▼
END OF CHAIN - No further routing!
```

## **🚨 CRITICAL ISSUE IDENTIFIED**

### **Missing Component: Protocol Message Router**

**The Problem:** 
- `communication_request` messages reach NetworkPlugin and are logged
- **But NetworkPlugin is just a logging plugin - it doesn't route messages anywhere**
- **There's no component that routes protocol messages to ConnectionsModel/LeuteConnectionsModule**

### **Expected Flow (Currently Missing):**
```
WebSocket Message: '{"command": "communication_request", "sourcePublicKey": "...", "targetPublicKey": "..."}'
    │
    ▼
WebSocketPlugin (passes through - not ping/pong)
    │
    ▼
PromisePlugin (parses JSON successfully)
    │
    ▼
🚨 MISSING: ProtocolRoutingPlugin 
    │ (should recognize communication_request and route to LeuteConnectionsModule)
    ▼
LeuteConnectionsModule.acceptConnection() / acceptConnectionViaCatchAll()
    │
    ▼
ConnectionsModel.onUnknownConnection()
    │
    ▼
PairingManager.acceptInvitation()
```

### **What Should Happen:**
1. **ConnectionRouteManager** should receive the connection via `onConnection` or `onConnectionViaCatchAll` events
2. **LeuteConnectionsModule** should call `acceptConnection()` or `acceptConnectionViaCatchAll()`
3. **ConnectionsModel** should receive `onUnknownConnection` event
4. **PairingManager** should handle the pairing protocol

### **What Actually Happens:**
1. **Connection receives `communication_request`**
2. **NetworkPlugin logs it** 
3. **No routing occurs**
4. **Connection sits idle until ping timeout**
5. **Connection closes due to ping parsing error**

## **Root Cause Analysis**

The issue is **architectural**: 
- **Connections are created with plugin chains for message processing**
- **But there's no bridge between the plugin chain and the ConnectionsModel/LeuteConnectionsModule**
- **The `communication_request` message indicates a pairing attempt, but no component recognizes this and routes it appropriately**

## **Solution Required**

We need to create a **ProtocolRoutingPlugin** that:
1. **Recognizes protocol messages** (communication_request, etc.)
2. **Routes them to the appropriate handlers** (LeuteConnectionsModule, PairingManager)
3. **Is positioned correctly in the plugin chain** (after PromisePlugin, before NetworkPlugin)

## **Next Steps**
- **Task 1.2**: Identify exactly what component should handle this routing
- **Task 1.3**: Study one.leute to see how it handles this correctly
- **Task 2**: Investigate ConnectionsModel integration to understand the missing link 