/**
 * Startup optimization utilities
 * 
 * Helps defer non-critical operations during app startup to ensure
 * smooth UI rendering and fast initial load times.
 */

/**
 * Priority levels for startup operations
 */
export enum StartupPriority {
  CRITICAL = 0,     // Must complete before UI is shown (auth, core models)
  HIGH = 1,         // Important but can be deferred slightly (topic loading)
  MEDIUM = 2,       // Can wait until after initial render (device discovery)
  LOW = 3,          // Background operations (analytics, cleanup)
}

/**
 * Defer an operation based on its priority
 */
export function deferStartupOperation(
  operation: () => Promise<void> | void,
  priority: StartupPriority = StartupPriority.MEDIUM
): void {
  const delay = priority * 100; // 0ms for critical, 100ms for high, etc.
  
  if (delay === 0) {
    // Critical operations run immediately
    Promise.resolve(operation()).catch(error => {
      console.error('[StartupOptimization] Critical operation failed:', error);
    });
  } else {
    // Defer based on priority
    setTimeout(() => {
      Promise.resolve(operation()).catch(error => {
        console.error('[StartupOptimization] Deferred operation failed:', error);
      });
    }, delay);
  }
}

/**
 * Mark when the app has finished initial render
 */
let initialRenderComplete = false;

export function markInitialRenderComplete(): void {
  initialRenderComplete = true;
  console.log('[StartupOptimization] Initial render complete');
}

/**
 * Defer operation until after initial render
 */
export function deferUntilAfterRender(operation: () => Promise<void> | void): void {
  if (initialRenderComplete) {
    // Already rendered, run immediately
    setImmediate(() => {
      Promise.resolve(operation()).catch(error => {
        console.error('[StartupOptimization] Post-render operation failed:', error);
      });
    });
  } else {
    // Wait for render, then run with additional delay
    const checkInterval = setInterval(() => {
      if (initialRenderComplete) {
        clearInterval(checkInterval);
        setTimeout(() => {
          Promise.resolve(operation()).catch(error => {
            console.error('[StartupOptimization] Post-render operation failed:', error);
          });
        }, 100); // Small additional delay after render
      }
    }, 50);
  }
}