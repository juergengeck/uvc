/**
 * NetworkModel - Primary network layer controller
 * 
 * This model orchestrates all networking functionality including UDP sockets,
 * QUIC transport, and device discovery. It provides a unified interface for
 * the application layer to interact with the networking subsystem.
 */

import { StateMachine } from '@refinio/one.models/lib/misc/StateMachine.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import Debug from 'debug';

// Use React Native's EventEmitter instead of Node.js events
class EventEmitter {
  private listeners: Map<string, Function[]> = new Map();
  
  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }
  
  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }
  
  addListener = this.on;
  
  once(event: string, listener: Function): this {
    const onceWrapper = (...args: any[]) => {
      this.removeListener(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }
  
  removeListener(event: string, listener: Function): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }
  
  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
} 