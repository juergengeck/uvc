/**
 * message-bus.ts
 * 
 * Minimal message bus utilities - focused on results, not bloat
 */

// Simple export for backward compatibility
export function debugLog(type: string, source: string, message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`🔍 [${timestamp}] [${type.toUpperCase()}] [${source}]:`, message, ...args.map(arg => String(arg)));
}

export default {
  debugLog
};