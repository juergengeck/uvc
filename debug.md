# Debug Output for Chum Connections in one.core

## ⚠️ CRITICAL: Why You Don't See Debug Output

**If you're not seeing any debug output from one.core, this is why:**

one.core has a **logger override system** (`src/system/expo/logger-override.ts`) that **blocks ALL MessageBus messages by default**. This system:

1. **Overrides every MessageBus instance** created in your app
2. **Blocks all `MessageBus.send()` calls** unless logging is explicitly enabled
3. **Defaults to `loggingEnabled = false`** and `logLevel = 'none'`
4. **Silently drops all debug messages** without any indication

### The Fix: You MUST Enable Logging First

Before you'll see any debug output, you must explicitly enable logging:

```typescript
import { initExpoSystem } from 'one.core/system/expo/init';

// REQUIRED: Enable debug logging first
await initExpoSystem({
  logLevel: 'debug',        // ← This is REQUIRED
  enableNetworkDebug: true
});
```

Or manually:
```typescript
import { setLogLevel, enableLogging } from 'one.core/system/expo/logging-config';

// REQUIRED: Enable logging manually
setLogLevel('debug');
enableLogging();
```

**Without this step, you will see ZERO debug output**, even though all the logging code exists and is working - it's just being blocked at the MessageBus level.

## Overview

one.core provides extensive debug output capabilities for chum connections that can be activated and provided to apps. The system uses a sophisticated MessageBus-based logging architecture that provides detailed insights into connection establishment, data synchronization, error tracking, and performance metrics.

## Debug Output Capabilities

### 1. **MessageBus-Based Logging System**
The core uses a sophisticated MessageBus system that provides detailed logging for all chum operations:

- **Chum Sync**: Logs connection establishment, data transfer, errors, and completion
- **Chum Importer**: Logs object imports, root hash processing, and synchronization status  
- **Chum Exporter**: Logs service registration, data exports, and connection lifecycle
- **Connection Management**: Logs WebSocket creation, encryption, and protocol handshakes

### 2. **Activation Methods**

#### **For Expo Apps:**
```typescript
import { initExpoSystem } from 'one.core/system/expo/init';
import { startLogger } from 'one.core/logger';

// Method 1: Initialize with debug logging
await initExpoSystem({
  logLevel: 'debug',
  enableNetworkDebug: true
});

// Method 2: Start logger with specific types
startLogger({
  includeInstanceName: true,
  includeTimestamp: true,
  types: ['debug', 'log', 'alert', 'error']
});
```

#### **Via Environment Variables:**
```bash
# Enable network debugging
ONE_NETWORK_DEBUG=true
ONE_NETWORK_DEBUG_LEVEL=debug
```

### 3. **Available Debug Information**

The system provides detailed logging for:

- **Connection IDs and lifecycle**: `[${connection.connId}] CHUM OPTIONS: {...}`
- **Data transfer progress**: Object counts, blob/clob transfers, synchronization status
- **Protocol details**: Handshakes, encryption, message exchanges
- **Error tracking**: Comprehensive error logging with context
- **Performance metrics**: Transfer statistics, timing information
- **Network operations**: WebSocket creation, QUIC transport, packet inspection

### 4. **App Integration**

Apps can access debug output by:

```typescript
import { createMessageBus } from 'one.core/message-bus';

// Create app's message bus instance
const AppMessageBus = createMessageBus('your-app');

// Subscribe to chum debug messages
AppMessageBus.on('debug', (source, ...messages) => {
  if (source.includes('chum')) {
    console.log(`Chum Debug [${source}]:`, ...messages);
  }
});

// Subscribe to all log types from chum components
['log', 'debug', 'alert', 'error'].forEach(type => {
  AppMessageBus.on(type, (source, ...messages) => {
    if (source.includes('chum') || source.includes('websocket')) {
      console.log(`[${type.toUpperCase()}] ${source}:`, ...messages);
    }
  });
});
```

### 5. **Specific Chum Debug Output Examples**

The system logs detailed information like:
- `[123456] Chum, local: Alice, remote: Bob, import: true, export: true`
- `[123456] EXPORTER STARTED`
- `[123456] Received root hashes: {...}`
- `[123456] Import root hash: {...}`
- `[123456] FINAL new Chum object: {...}`
- `[123456] END of chum-sync, Chum object HASH abc123`

### 6. **Network-Level Debugging**

For deeper network analysis:
```typescript
import { createNetworkLogger } from 'one.core/system/expo/network-debug';

const logger = createNetworkLogger('chum-connection');
logger.debug('Connection details', connectionInfo);
logger.info('Data transfer progress', transferStats);
```

## Log Levels

The system supports four logging levels:

1. **debug** - Detailed information for debugging (most verbose)
2. **info** - General information about application flow
3. **warn** - Warning messages for potential issues
4. **error** - Error messages for critical issues

## Configuration Options

### Runtime Configuration
```typescript
import { 
    setLogLevel, 
    getLogLevel, 
    enableLogging, 
    disableLogging 
} from 'one.core/system/expo/logging-config';

// Set the logging level
setLogLevel('debug');

// Get the current logging level
const currentLevel = getLogLevel();

// Enable/disable logging
enableLogging();
disableLogging();
```

### Environment Variables
```bash
# Enable network debugging
ONE_NETWORK_DEBUG=true

# Set the logging level (debug, info, warn, error)
ONE_NETWORK_DEBUG_LEVEL=debug
```

## Debugging WebSocket Duplication Issues

For the specific WebSocket duplication bug, enable these debug outputs:

```typescript
// Enable comprehensive logging
startLogger({
  includeInstanceName: true,
  includeTimestamp: true,
  types: ['debug', 'log', 'alert', 'error']
});

// Subscribe to WebSocket-specific messages
AppMessageBus.on('debug', (source, ...messages) => {
  if (source.includes('websocket') || source.includes('connection')) {
    console.log(`WebSocket Debug [${source}]:`, ...messages);
  }
});

// Monitor connection creation
AppMessageBus.on('log', (source, ...messages) => {
  if (messages.some(msg => 
    typeof msg === 'string' && 
    (msg.includes('createWebSocket') || msg.includes('connection'))
  )) {
    console.log(`Connection Event [${source}]:`, ...messages);
  }
});
```

## Key Components with Debug Output

### Chum Sync (`chum-sync`)
- Connection establishment and teardown
- Import/export coordination
- Error handling and recovery
- Final synchronization results

### Chum Importer (`chum-importer`)
- Object import progress
- Root hash processing
- Protocol version checking
- Synchronization completion

### Chum Exporter (`chum-exporter`)
- Service registration
- Data export operations
- Connection lifecycle management

### WebSocket (`websocket`, `websocket-promisifier`)
- Connection creation and management
- Message exchange logging
- Connection state changes
- Error conditions

## Performance Considerations

- **Debug level logging** can impact performance and generate large amounts of log data
- Use **info** or **warn** levels in production-like environments
- Use **debug** level only for troubleshooting specific issues
- Consider filtering by component name to reduce noise

## Best Practices

1. **Use appropriate log levels** for your messages
2. **Include context** with your log messages (connection IDs, timestamps, etc.)
3. **Filter by component** to focus on specific areas
4. **Monitor connection IDs** to track individual connection lifecycles
5. **Clean up logging resources** when shutting down the application

## Troubleshooting Common Issues

### WebSocket Duplication
- Monitor connection creation timestamps
- Track connection IDs to identify duplicates
- Watch for `Promise.all` patterns that might create multiple connections
- Check for retry/fallback logic that could spawn additional connections

### Synchronization Failures
- Monitor chum import/export progress
- Check for protocol version mismatches
- Watch for connection drops during data transfer
- Track error messages in chum objects

### Performance Issues
- Monitor transfer statistics
- Track object counts and sizes
- Watch for timeout conditions
- Check network-level debugging for packet inspection

This comprehensive debug system allows apps to monitor chum connections in real-time, track data synchronization, diagnose connection issues, and analyze performance metrics. The logging is configurable by level and can be enabled/disabled as needed for production vs. development environments. 