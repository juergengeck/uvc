# MessageBus in one.core

## Overview

The MessageBus is a simple event system in one.core that enables loose coupling between components. It allows different parts of your application to communicate without direct dependencies. Messages are sent on a "bus" and any module can subscribe to messages of specific types.

## Creating a MessageBus Instance

To use the MessageBus, you first need to create an instance for your component:

```javascript
import { createMessageBus } from './message-bus.js';

// Create a message bus instance with your component's ID
const MessageBus = createMessageBus('your-app-name');
```

The `moduleId` you provide will be included as the source when sending messages, allowing other components to filter by source if needed.

## Subscribing to Messages

### Basic Subscription

To listen for messages of a specific type (regardless of source):

```javascript
// Listen for all 'log' messages from any source
MessageBus.on('log', (source, ...messages) => {
  console.log(`Log from ${source}:`, ...messages);
});
```

### Source-Specific Subscription

To listen only for messages from a specific source:

```javascript
// Listen only for 'log' messages from 'chum-sync'
MessageBus.on('chum-sync:log', (source, ...messages) => {
  console.log(`Log from ${source}:`, ...messages);
});
```

### One-Time Subscription

If you only want to receive the first occurrence of a message:

```javascript
// Listen for the first 'init-complete' message
MessageBus.once('init-complete', (source, ...messages) => {
  console.log(`Init completed from ${source}:`, ...messages);
});
```

## Unsubscribing from Messages

To stop receiving messages, you need to remove your handler function:

```javascript
const handleLog = (source, ...messages) => {
  console.log(`Log from ${source}:`, ...messages);
};

// Subscribe
MessageBus.on('log', handleLog);

// Later, unsubscribe
MessageBus.remove('log', handleLog);
```

Note: It's important to keep a reference to your handler function to be able to remove it later.

## Sending Messages

To send a message:

```javascript
// Send a simple message
MessageBus.send('app-status', 'App is running');

// Send a message with multiple data items
MessageBus.send('data-update', { id: 123, value: 'updated' }, new Date());
```

The first parameter is the message type, followed by any number of additional parameters that will be passed to the subscribers.

## Accessing MessageBus from an External App

If your app is importing one.core as a dependency, you can access and monitor the MessageBus output with these steps:

### 1. Import the MessageBus creator

```javascript
import { createMessageBus } from 'one.core/message-bus.js';

// Create your app's message bus instance
const AppMessageBus = createMessageBus('external-app');
```

### 2. Subscribe to one.core message types

You can listen to any messages being sent by one.core components:

```javascript
// Listen to all log messages from one.core
AppMessageBus.on('log', (source, ...messages) => {
  console.log(`[one.core:${source}] Log:`, ...messages);
});

// Listen to all error messages
AppMessageBus.on('error', (source, error) => {
  console.error(`[one.core:${source}] Error:`, error);
});

// Listen to storage events
AppMessageBus.on('storage:new-object', (source, objectInfo) => {
  console.log(`New object stored by ${source}:`, objectInfo);
});
```

### 3. Create a dedicated logger for one.core messages

For more structured monitoring:

```javascript
class OneCoreBusMonitor {
  constructor() {
    this.messageBus = createMessageBus('one-core-monitor');
    this.initHandlers();
  }

  initHandlers() {
    // Monitor all common message types
    this.messageBus.on('log', this.logMessage.bind(this));
    this.messageBus.on('info', this.logInfo.bind(this));
    this.messageBus.on('debug', this.logDebug.bind(this));
    this.messageBus.on('alert', this.logAlert.bind(this));
    this.messageBus.on('error', this.logError.bind(this));
    
    // Monitor specific one.core events
    this.messageBus.on('storage:new-object', this.handleNewObject.bind(this));
  }

  logMessage(source, ...messages) {
    console.log(`[one.core:${source}]`, ...messages);
    // You could also send these to your app's logging system
  }

  logInfo(source, ...messages) {
    console.info(`[one.core:${source}]`, ...messages);
  }

  logDebug(source, ...messages) {
    console.debug(`[one.core:${source}]`, ...messages);
  }

  logAlert(source, ...messages) {
    console.warn(`[one.core:${source}] ALERT:`, ...messages);
    // Could trigger UI notifications for important alerts
  }

  logError(source, error) {
    console.error(`[one.core:${source}] ERROR:`, error);
    // Could forward to your app's error tracking system
  }

  handleNewObject(source, objectInfo) {
    console.log(`New object stored: ${objectInfo.hash} (${objectInfo.type})`);
    // Could update your app's state or UI
  }
}

// Usage
const monitor = new OneCoreBusMonitor();
```

### 4. Display messages in your app's UI

You can route MessageBus messages to your app's UI components:

```javascript
class MessageConsoleComponent {
  constructor(domElement) {
    this.domElement = domElement;
    this.messageBus = createMessageBus('message-console');
    this.setupListeners();
  }

  setupListeners() {
    // Listen to all message types
    this.messageBus.on('log', this.appendMessage.bind(this, 'log'));
    this.messageBus.on('info', this.appendMessage.bind(this, 'info'));
    this.messageBus.on('debug', this.appendMessage.bind(this, 'debug'));
    this.messageBus.on('alert', this.appendMessage.bind(this, 'alert'));
    this.messageBus.on('error', this.appendMessage.bind(this, 'error'));
  }

  appendMessage(level, source, ...messages) {
    const messageText = messages.map(m => 
      typeof m === 'object' ? JSON.stringify(m) : String(m)
    ).join(' ');
    
    const element = document.createElement('div');
    element.className = `message message-${level}`;
    element.innerHTML = `
      <span class="message-time">${new Date().toISOString()}</span>
      <span class="message-source">${source}</span>
      <span class="message-level">${level}</span>
      <span class="message-text">${messageText}</span>
    `;
    
    this.domElement.appendChild(element);
    this.domElement.scrollTop = this.domElement.scrollHeight;
  }
}

// Usage in a web app
const consoleEl = document.getElementById('message-console');
const messageConsole = new MessageConsoleComponent(consoleEl);
```

## Common Message Types

These are some common message types used in one.core:

- `'log'` - General logging information
- `'debug'` - Detailed debugging information
- `'alert'` - Important alerts that may require attention
- `'info'` - Informational messages
- `'error'` - Error messages

## Complete Example

Here's a complete example of how an application might use the MessageBus:

```javascript
import { createMessageBus } from './message-bus.js';

class MyApp {
  constructor() {
    // Create a message bus for this component
    this.messageBus = createMessageBus('my-app');
    
    // Set up message handlers
    this.setupMessageHandlers();
  }
  
  setupMessageHandlers() {
    // Listen for all system logs
    this.messageBus.on('log', this.handleLog.bind(this));
    
    // Listen for errors from any source
    this.messageBus.on('error', this.handleError.bind(this));
    
    // Listen for data updates specifically from the storage system
    this.messageBus.on('storage:data-update', this.handleDataUpdate.bind(this));
  }
  
  handleLog(source, ...messages) {
    console.log(`[${source}]`, ...messages);
  }
  
  handleError(source, error) {
    console.error(`Error from ${source}:`, error);
    // Take appropriate action based on the error
  }
  
  handleDataUpdate(source, data) {
    console.log(`Data update from ${source}:`, data);
    // Update UI or internal state based on the new data
  }
  
  // App methods that send messages
  initialize() {
    this.messageBus.send('init', 'Application starting');
    // Initialization logic...
    this.messageBus.send('init-complete', { status: 'success' });
  }
  
  updateData(id, value) {
    // Update logic...
    this.messageBus.send('data-update', { id, value, timestamp: Date.now() });
  }
  
  cleanup() {
    // Remove handlers to prevent memory leaks
    this.messageBus.remove('log', this.handleLog.bind(this));
    this.messageBus.remove('error', this.handleError.bind(this));
    this.messageBus.remove('storage:data-update', this.handleDataUpdate.bind(this));
  }
}

// Usage
const app = new MyApp();
app.initialize();
```

## Implementation Notes

- Message handlers are called synchronously in the order they were registered
- Specific handlers (those subscribed to a source:type pattern) are called before general handlers
- The system doesn't provide any built-in error handling - if a subscriber throws an error, it will propagate
- There is no built-in debugging or monitoring of message flow 