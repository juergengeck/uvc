/**
 * LLM Debug Logger
 * 
 * Utility for debugging LLM message flow from user input to AI response.
 * This allows tracing all steps along the chat -> LLM model -> response path.
 */

// Define log levels - higher number means more detailed logging
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

// Global settings
const settings = {
  logLevel: LogLevel.TRACE, // Default to most verbose
  groupStep: true,          // Group logs by processing step
  prefixTimestamp: true,    // Add timestamp to logs
  captureToFile: false      // Whether to capture logs to a file (not implemented yet)
};

// Log storage for runtime access
export const logStore: {
  messages: Array<{
    level: LogLevel;
    component: string;
    message: string;
    details?: any;
    timestamp: Date;
  }>;
} = {
  messages: []
};

/**
 * Format current timestamp for logs
 */
function formatTimestamp(): string {
  if (!settings.prefixTimestamp) return '';
  
  const now = new Date();
  return `[${now.toISOString().split('T')[1].split('Z')[0]}]`;
}

/**
 * Base logging function
 */
function log(level: LogLevel, component: string, message: string, details?: any) {
  if (level > settings.logLevel) return;
  
  const timestamp = new Date();
  const timeString = formatTimestamp();
  const logEntry = { level, component, message, details, timestamp };
  
  // Store in memory log
  logStore.messages.push(logEntry);
  
  // Log to console with appropriate level
  const formattedMessage = `${timeString} [LLM:${component}] ${message}`;
  
  switch (level) {
    case LogLevel.ERROR:
      console.error(formattedMessage, details || '');
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage, details || '');
      break;
    case LogLevel.INFO:
      console.log(formattedMessage, details || '');
      break;
    case LogLevel.DEBUG:
    case LogLevel.TRACE:
      console.debug(formattedMessage, details || '');
      break;
  }
}

/**
 * Start a logical group of logs
 */
export function startStep(component: string, stepName: string) {
  if (settings.groupStep) {
    console.group(`${formatTimestamp()} [LLM:${component}] Starting step: ${stepName}`);
  }
  log(LogLevel.INFO, component, `Step started: ${stepName}`);
}

/**
 * End a logical group of logs
 */
export function endStep(component: string, stepName: string) {
  log(LogLevel.INFO, component, `Step completed: ${stepName}`);
  if (settings.groupStep) {
    console.groupEnd();
  }
}

/**
 * Error logging
 */
export function error(component: string, message: string, details?: any) {
  log(LogLevel.ERROR, component, message, details);
}

/**
 * Warning logging
 */
export function warn(component: string, message: string, details?: any) {
  log(LogLevel.WARN, component, message, details);
}

/**
 * Info logging
 */
export function info(component: string, message: string, details?: any) {
  log(LogLevel.INFO, component, message, details);
}

/**
 * Debug logging
 */
export function debug(component: string, message: string, details?: any) {
  log(LogLevel.DEBUG, component, message, details);
}

/**
 * Trace logging (most verbose)
 */
export function trace(component: string, message: string, details?: any) {
  log(LogLevel.TRACE, component, message, details);
}

/**
 * Configure logger settings
 */
export function configure(options: {
  logLevel?: LogLevel;
  groupStep?: boolean;
  prefixTimestamp?: boolean;
  captureToFile?: boolean;
}) {
  Object.assign(settings, options);
}

/**
 * Get current configuration
 */
export function getConfiguration() {
  return { ...settings };
}

/**
 * Get all logs as text for sharing/debugging
 */
export function getLogsAsText(): string {
  return logStore.messages
    .map(entry => {
      const level = LogLevel[entry.level];
      const time = entry.timestamp.toISOString();
      const details = entry.details ? ` - ${JSON.stringify(entry.details)}` : '';
      return `${time} [${level}] [${entry.component}] ${entry.message}${details}`;
    })
    .join('\n');
}

// Export the logger as a single object for easier imports
export const LLMLogger = {
  startStep,
  endStep,
  error,
  warn,
  info,
  debug,
  trace,
  configure,
  getConfiguration,
  getLogsAsText,
  LogLevel,
  logStore
};

export default LLMLogger; 