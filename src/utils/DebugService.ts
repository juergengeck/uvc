// Debug service that works independently of React components
type DebugListener = (message: string, level: 'info' | 'warn' | 'error', data?: any) => void;
type VisibilityListener = (isVisible: boolean) => void;

class DebugService {
  private listeners: DebugListener[] = [];
  private visibilityListeners: VisibilityListener[] = [];
  private _isVisible: boolean = false;
  private contextStack: string[] = []; // For context prefixes like [createTopic:abc123]
  
  /**
   * Log an informational message with optional data
   */
  info(message: string, data?: any) {
    const formattedMessage = this.formatMessage(message);
    console.log(formattedMessage, data !== undefined ? data : '');
    this.notifyListeners(formattedMessage, 'info', data);
    return formattedMessage;
  }
  
  /**
   * Log a warning message with optional data
   */
  warn(message: string, data?: any) {
    const formattedMessage = this.formatMessage(message);
    console.warn(formattedMessage, data !== undefined ? data : '');
    this.notifyListeners(formattedMessage, 'warn', data);
    return formattedMessage;
  }
  
  /**
   * Log an error message with optional data
   */
  error(message: string, data?: any) {
    const formattedMessage = this.formatMessage(message);
    console.error(formattedMessage, data !== undefined ? data : '');
    this.notifyListeners(formattedMessage, 'error', data);
    return formattedMessage;
  }
  
  /**
   * Push a context prefix to the stack for logging (e.g., function name, invocation ID)
   * Returns a cleanup function to pop this context when done
   */
  pushContext(context: string): () => void {
    this.contextStack.push(context);
    return () => this.popContext();
  }
  
  /**
   * Create and push a context with a random invocation ID, like [functionName:abc123]
   */
  createContext(functionName: string): { id: string, cleanup: () => void } {
    const invocationId = Math.random().toString(36).substring(2, 10);
    const context = `[${functionName}:${invocationId}]`;
    this.contextStack.push(context);
    return {
      id: invocationId,
      cleanup: () => this.popContext()
    };
  }
  
  /**
   * Pop the latest context from the stack
   */
  popContext(): string | undefined {
    return this.contextStack.pop();
  }
  
  /**
   * Format a message with the current context stack
   */
  private formatMessage(message: string): string {
    if (this.contextStack.length === 0) {
      return message;
    }
    const context = this.contextStack[this.contextStack.length - 1];
    return `${context} ${message}`;
  }
  
  /**
   * Subscribe to debug messages
   */
  subscribe(listener: DebugListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  /**
   * Subscribe to visibility changes
   */
  subscribeVisibility(listener: VisibilityListener) {
    this.visibilityListeners.push(listener);
    listener(this._isVisible);
    return () => {
      this.visibilityListeners = this.visibilityListeners.filter(l => l !== listener);
    };
  }
  
  /**
   * Toggle debug overlay visibility
   */
  toggleVisibility() {
    this.setVisible(!this._isVisible);
  }
  
  /**
   * Set debug overlay visibility
   */
  setVisible(isVisible: boolean) {
    if (this._isVisible !== isVisible) {
      this._isVisible = isVisible;
      this.notifyVisibilityListeners();
    }
  }
  
  /**
   * Get current visibility state
   */
  get isVisible() {
    return this._isVisible;
  }
  
  /**
   * Clear all contexts
   */
  clearContexts() {
    this.contextStack = [];
  }
  
  private notifyListeners(message: string, level: 'info' | 'warn' | 'error', data?: any) {
    this.listeners.forEach(listener => {
      try {
        listener(message, level, data);
      } catch (error) {
        console.error('Error in debug listener:', error);
      }
    });
  }
  
  private notifyVisibilityListeners() {
    this.visibilityListeners.forEach(listener => {
      try {
        listener(this._isVisible);
      } catch (error) {
        console.error('Error in visibility listener:', error);
      }
    });
  }
  
  /**
   * Add tap coordinates to the debug output
   * @param x X coordinate
   * @param y Y coordinate
   * @param description Optional description of what was tapped
   */
  logTap(x: number, y: number, description?: string) {
    const message = description 
      ? `Tap at (${Math.round(x)}, ${Math.round(y)}) - ${description}`
      : `Tap at (${Math.round(x)}, ${Math.round(y)})`;
    this.info(message);
  }
  
  /**
   * Log a function step with stage information, similar to how createTopic logs
   */
  logStep(functionName: string, step: string, details?: any) {
    const stepMessage = `STEP ${step}`;
    return this.info(stepMessage, details);
  }
  
  /**
   * Log a topic creation event
   */
  logTopicCreation(topicId: string, stage: string, details?: any) {
    let message = `Topic ${topicId} - ${stage}`;
    this.info(message, details);
  }
  
  /**
   * Log a topic error
   */
  logTopicError(topicId: string, stage: string, error: any) {
    let message = `Topic ${topicId} - ERROR at ${stage}`;
    this.error(message, error);
  }
  
  /**
   * Apply DebugService to a function, surrounding it with start/end logging
   * and catching errors
   */
  trackFunction<T extends (...args: any[]) => any>(
    name: string, 
    func: T
  ): (...args: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
      const { cleanup } = this.createContext(name);
      this.info(`STARTING`);
      
      try {
        const result = func(...args);
        
        // Handle promises
        if (result instanceof Promise) {
          return result
            .then(value => {
              this.info(`COMPLETED successfully`);
              cleanup();
              return value;
            })
            .catch(error => {
              this.error(`FAILED with error`, error);
              cleanup();
              throw error;
            }) as ReturnType<T>;
        }
        
        // Handle synchronous functions
        this.info(`COMPLETED successfully`);
        cleanup();
        return result;
      } catch (error) {
        this.error(`FAILED with error`, error);
        cleanup();
        throw error;
      }
    };
  }
}

// Create a singleton instance
export const debugService = new DebugService();

/**
 * Shorthand debug functions for convenience
 */
export const debug = {
  info: (message: string, data?: any) => debugService.info(message, data),
  warn: (message: string, data?: any) => debugService.warn(message, data),
  error: (message: string, data?: any) => debugService.error(message, data),
  createContext: (name: string) => debugService.createContext(name),
  logStep: (name: string, step: string, details?: any) => debugService.logStep(name, step, details),
  trackFunction: <T extends (...args: any[]) => any>(name: string, func: T) => 
    debugService.trackFunction(name, func),
  setVisible: (visible: boolean) => debugService.setVisible(visible),
  toggle: () => debugService.toggleVisibility()
};

// Export default for convenience
export default debugService; 