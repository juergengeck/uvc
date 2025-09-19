/**
 * Simple logger utility for the Lamas application
 * 
 * Provides component-specific loggers with consistent formatting.
 */

export interface Logger {
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
}

/**
 * Format current timestamp for logs
 */
function formatTimestamp(): string {
  const now = new Date();
  return `[${now.toISOString().split('T')[1].split('Z')[0]}]`;
}

/**
 * Create a logger instance for a specific component
 */
export function getLogger(component: string): Logger {
  const prefix = `${formatTimestamp()} [${component}]`;
  
  return {
    info(message: string, ...args: any[]) {
      console.log(`${prefix} ${message}`, ...args);
    },
    
    debug(message: string, ...args: any[]) {
      console.debug(`${prefix} ${message}`, ...args);
    },
    
    error(message: string, ...args: any[]) {
      console.error(`${prefix} ${message}`, ...args);
    },
    
    warn(message: string, ...args: any[]) {
      console.warn(`${prefix} ${message}`, ...args);
    }
  };
}

export default { getLogger }; 