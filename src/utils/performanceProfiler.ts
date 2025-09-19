/**
 * Performance Profiler for ESP32 Operations
 * Tracks timing and performance metrics for ownership and LED control
 */

interface PerformanceMetric {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
  subOperations?: PerformanceMetric[];
}

class PerformanceProfiler {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private operationStack: string[] = [];
  private enabled: boolean = true;

  /**
   * Start tracking an operation
   */
  startOperation(operationId: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      operation: operationId,
      startTime: performance.now(),
      metadata,
      subOperations: []
    };

    this.metrics.set(operationId, metric);
    this.operationStack.push(operationId);
    
    console.log(`[PERF] 🚀 START: ${operationId}`, metadata || '');
  }

  /**
   * End tracking an operation
   */
  endOperation(operationId: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    const metric = this.metrics.get(operationId);
    if (!metric) {
      console.warn(`[PERF] No metric found for operation: ${operationId}`);
      return;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    if (metadata) {
      metric.metadata = { ...metric.metadata, ...metadata };
    }

    // Remove from stack
    const stackIndex = this.operationStack.indexOf(operationId);
    if (stackIndex !== -1) {
      this.operationStack.splice(stackIndex, 1);
    }

    // If this was a sub-operation, add it to parent
    if (this.operationStack.length > 0) {
      const parentId = this.operationStack[this.operationStack.length - 1];
      const parent = this.metrics.get(parentId);
      if (parent?.subOperations) {
        parent.subOperations.push(metric);
      }
    }

    const durationStr = metric.duration.toFixed(2);
    const emoji = metric.duration > 1000 ? '🐢' : metric.duration > 500 ? '⚠️' : '✅';
    console.log(`[PERF] ${emoji} END: ${operationId} - ${durationStr}ms`, metadata || '');

    // Log warning for slow operations
    if (metric.duration > 1000) {
      console.warn(`[PERF] ⚠️ SLOW OPERATION: ${operationId} took ${durationStr}ms`);
      this.logCallStack(operationId);
    }
  }

  /**
   * Mark a checkpoint within an operation
   */
  checkpoint(label: string, metadata?: Record<string, any>): void {
    if (!this.enabled || this.operationStack.length === 0) return;

    const currentOp = this.operationStack[this.operationStack.length - 1];
    const metric = this.metrics.get(currentOp);
    if (!metric) return;

    const now = performance.now();
    const elapsed = now - metric.startTime;
    
    console.log(`[PERF] 📍 CHECKPOINT [${currentOp}]: ${label} - ${elapsed.toFixed(2)}ms elapsed`, metadata || '');
  }

  /**
   * Log the current call stack for debugging
   */
  private logCallStack(operationId: string): void {
    const metric = this.metrics.get(operationId);
    if (!metric) return;

    console.group(`[PERF] Call stack for ${operationId}`);
    
    // Log main operation
    console.log(`Main: ${metric.operation} - ${metric.duration?.toFixed(2)}ms`);
    
    // Log sub-operations
    if (metric.subOperations && metric.subOperations.length > 0) {
      console.log('Sub-operations:');
      metric.subOperations.forEach(sub => {
        console.log(`  - ${sub.operation}: ${sub.duration?.toFixed(2)}ms`);
      });
    }
    
    console.groupEnd();
  }

  /**
   * Get performance report
   */
  getReport(): string {
    const report: string[] = ['=== PERFORMANCE REPORT ==='];
    
    // Get root operations (not sub-operations)
    const rootOps = Array.from(this.metrics.values()).filter(m => 
      !Array.from(this.metrics.values()).some(parent => 
        parent.subOperations?.includes(m)
      )
    );

    rootOps.forEach(metric => {
      if (metric.duration) {
        report.push(`\n${metric.operation}: ${metric.duration.toFixed(2)}ms`);
        if (metric.subOperations && metric.subOperations.length > 0) {
          metric.subOperations.forEach(sub => {
            if (sub.duration) {
              report.push(`  └─ ${sub.operation}: ${sub.duration.toFixed(2)}ms`);
            }
          });
        }
      }
    });

    // Find slowest operations
    const allOps = Array.from(this.metrics.values()).filter(m => m.duration);
    const slowest = allOps.sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 5);
    
    if (slowest.length > 0) {
      report.push('\n=== SLOWEST OPERATIONS ===');
      slowest.forEach(m => {
        report.push(`${m.operation}: ${m.duration?.toFixed(2)}ms`);
      });
    }

    return report.join('\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.operationStack = [];
    console.log('[PERF] Metrics cleared');
  }

  /**
   * Print report and clear
   */
  flush(): void {
    console.log(this.getReport());
    this.clear();
  }

  /**
   * Measure async function execution time
   */
  async measureAsync<T>(
    operationId: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.startOperation(operationId, metadata);
    try {
      const result = await fn();
      this.endOperation(operationId, { success: true });
      return result;
    } catch (error) {
      this.endOperation(operationId, { success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Measure sync function execution time
   */
  measureSync<T>(
    operationId: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    this.startOperation(operationId, metadata);
    try {
      const result = fn();
      this.endOperation(operationId, { success: true });
      return result;
    } catch (error) {
      this.endOperation(operationId, { success: false, error: String(error) });
      throw error;
    }
  }
}

// Global instance
export const profiler = new PerformanceProfiler();

// Export for use in other files
export default profiler;