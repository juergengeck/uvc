// Import our debug configuration first - MUST be before any other imports
import '../config/one-core-debug';

/**
 * Global References & Polyfills
 * 
 * Provides a single source of truth for critical dependencies like StateMachine.
 * Prevents issues with circular dependencies and module initialization order.
 * 
 * IMPORTANT: This file MUST be imported after platform loading is complete
 * to ensure proper module resolution.
 */

// Direct imports to force eager loading
import { StateMachine } from '@refinio/one.models/lib/misc/StateMachine.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { Model as ModelModule } from '@refinio/one.models/lib/models/Model.js';

/**
 * Global StateMachine reference to prevent circular dependencies
 * 
 * This ensures all modules use the same StateMachine instance and prevents
 * issues with modules importing StateMachine in different orders.
 */
export const GlobalStateMachine = StateMachine;

/**
 * Global OEvent reference for event handling
 */
export const GlobalOEvent = OEvent;

/**
 * Global Model reference for base model functionality
 */
export const GlobalModel = ModelModule;

/**
 * Utility function to get the global StateMachine instance
 * 
 * This is the recommended way to access StateMachine to ensure
 * consistent usage across the entire application.
 */
export function getStateMachine() {
  return StateMachine;
}

/**
 * Utility function to get the global OEvent class
 */
export function getOEvent() {
  return OEvent;
}

/**
 * Utility function to get the global Model class
 */
export function getModel() {
  return ModelModule;
}

console.log('[GlobalReferences] Loaded core references - StateMachine, OEvent, Model');
console.log('[GlobalReferences] Using one.core buffer system for proper Expo compatibility'); 