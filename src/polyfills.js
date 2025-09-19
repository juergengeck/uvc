// Ensure EventEmitter is available
// Check for our shim's EventEmitter first, then try import, finally fallback to minimal implementation

// First, check if EventEmitter is already defined globally from our shim
if ((typeof global !== 'undefined' && global.EventEmitter) || 
    (typeof globalThis !== 'undefined' && globalThis.EventEmitter)) {
  // EventEmitter is already available globally - just re-export it
  const EE = global.EventEmitter || globalThis.EventEmitter;
  module.exports = { EventEmitter: EE };
  console.log('Using existing global EventEmitter');
} else {
  // Not available globally, try requiring it
  try {
    const { EventEmitter } = require('events');
    // Export it for explicit imports
    module.exports = { EventEmitter };
    
    // Make it globally available
    if (typeof global !== 'undefined') {
      global.EventEmitter = EventEmitter;
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.EventEmitter = EventEmitter;
    }
    console.log('Successfully loaded EventEmitter from events package');
  } catch (error) {
    console.warn('Failed to import EventEmitter, using minimal implementation:', error);
    
    // If the normal import fails, create a minimal EventEmitter implementation
    class MinimalEventEmitter {
      constructor() {
        this._events = {};
      }
      
      on(event, listener) {
        if (!this._events[event]) {
          this._events[event] = [];
        }
        this._events[event].push(listener);
        return this;
      }
      
      emit(event, ...args) {
        if (!this._events[event]) {
          return false;
        }
        this._events[event].forEach(listener => listener(...args));
        return true;
      }
      
      removeListener(event, listener) {
        if (!this._events[event]) {
          return this;
        }
        this._events[event] = this._events[event].filter(l => l !== listener);
        return this;
      }
      
      once(event, listener) {
        const onceListener = (...args) => {
          listener(...args);
          this.removeListener(event, onceListener);
        };
        return this.on(event, onceListener);
      }
    }
    
    // Export our minimal implementation
    module.exports = { EventEmitter: MinimalEventEmitter };
    
    // Make it globally available
    if (typeof global !== 'undefined') {
      global.EventEmitter = MinimalEventEmitter;
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.EventEmitter = MinimalEventEmitter;
    }
    
    console.warn('Using minimal EventEmitter polyfill - events package failed to load');
  }
} 