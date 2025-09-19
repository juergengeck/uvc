/**
 * DeferredQueue - A simple queue that defers task execution to avoid blocking the UI
 * 
 * This utility helps prevent blocking the React Native UI thread by deferring
 * non-critical operations using setImmediate/setTimeout.
 */

export class DeferredQueue {
  private tasks: (() => Promise<void> | void)[] = [];
  private isProcessing = false;
  private enabled = true;

  /**
   * Add a task to be executed after the current JS execution cycle
   */
  enqueue(task: () => Promise<void> | void): void {
    if (!this.enabled) return;
    
    this.tasks.push(task);
    
    // Defer processing to next tick to avoid blocking current execution
    if (!this.isProcessing) {
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Process the next task in the queue
   */
  private async processNext(): Promise<void> {
    if (!this.enabled || this.tasks.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    const task = this.tasks.shift();
    
    if (task) {
      try {
        await task();
      } catch (error) {
        console.error('[DeferredQueue] Task error:', error);
      }
    }
    
    // Continue processing if more tasks exist
    if (this.tasks.length > 0 && this.enabled) {
      // Use setImmediate to yield to other operations
      setImmediate(() => this.processNext());
    } else {
      this.isProcessing = false;
    }
  }

  /**
   * Clear all pending tasks
   */
  clear(): void {
    this.tasks = [];
    this.isProcessing = false;
  }

  /**
   * Disable the queue (for cleanup)
   */
  disable(): void {
    this.enabled = false;
    this.clear();
  }

  /**
   * Get the number of pending tasks
   */
  get pendingCount(): number {
    return this.tasks.length;
  }
}

/**
 * Global deferred queue for device operations
 */
export const deviceOperationsQueue = new DeferredQueue();