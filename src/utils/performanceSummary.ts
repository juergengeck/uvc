/**
 * Performance Summary Module
 *
 * Collects and summarizes performance metrics during app initialization
 */

interface PerformanceEntry {
  name: string;
  duration: number;
  timestamp: number;
}

class PerformanceSummary {
  private entries: PerformanceEntry[] = [];
  private startTime: number = Date.now();
  private enabled: boolean = __DEV__;

  /**
   * Record a performance metric
   */
  record(name: string, duration: number): void {
    if (!this.enabled) return;

    this.entries.push({
      name,
      duration,
      timestamp: Date.now() - this.startTime
    });

    // Log immediately for debugging
    if (duration > 100) {
      console.log(`[PERF] ⚠️ ${name}: ${duration}ms (slow)`);
    } else {
      console.log(`[PERF] ✅ ${name}: ${duration}ms`);
    }
  }

  /**
   * Get all entries sorted by duration
   */
  getSlowestOperations(limit: number = 10): PerformanceEntry[] {
    return [...this.entries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get total initialization time
   */
  getTotalTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Generate a summary report
   */
  generateReport(): string {
    const totalTime = this.getTotalTime();
    const slowest = this.getSlowestOperations(10);

    let report = `\n====== PERFORMANCE SUMMARY ======\n`;
    report += `Total initialization time: ${totalTime}ms\n`;
    report += `\nTop 10 Slowest Operations:\n`;
    report += `--------------------------------\n`;

    slowest.forEach((entry, index) => {
      const percentage = ((entry.duration / totalTime) * 100).toFixed(1);
      report += `${index + 1}. ${entry.name}: ${entry.duration}ms (${percentage}%)\n`;
    });

    report += `\nBreakdown by Category:\n`;
    report += `--------------------------------\n`;

    // Categorize operations
    const categories: { [key: string]: number } = {
      crypto: 0,
      storage: 0,
      networking: 0,
      models: 0,
      ui: 0,
      other: 0
    };

    this.entries.forEach(entry => {
      const name = entry.name.toLowerCase();
      if (name.includes('crypto') || name.includes('key') || name.includes('scrypt')) {
        categories.crypto += entry.duration;
      } else if (name.includes('storage') || name.includes('init storage')) {
        categories.storage += entry.duration;
      } else if (name.includes('network') || name.includes('transport') || name.includes('comm') || name.includes('quic')) {
        categories.networking += entry.duration;
      } else if (name.includes('model') || name.includes('manager')) {
        categories.models += entry.duration;
      } else if (name.includes('render') || name.includes('ui')) {
        categories.ui += entry.duration;
      } else {
        categories.other += entry.duration;
      }
    });

    Object.entries(categories).forEach(([category, duration]) => {
      if (duration > 0) {
        const percentage = ((duration / totalTime) * 100).toFixed(1);
        report += `${category}: ${duration}ms (${percentage}%)\n`;
      }
    });

    report += `================================\n`;

    return report;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.entries = [];
    this.startTime = Date.now();
  }

  /**
   * Enable or disable tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Global singleton
export const performanceSummary = new PerformanceSummary();

// Auto-log summary on app ready
if (__DEV__) {
  // Log summary after 10 seconds (should be well after init)
  setTimeout(() => {
    console.log(performanceSummary.generateReport());
  }, 10000);
}

/**
 * Wrapper to automatically record performance
 */
export async function measureAndRecord<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    performanceSummary.record(name, Date.now() - startTime);
    return result;
  } catch (error) {
    performanceSummary.record(`${name} (failed)`, Date.now() - startTime);
    throw error;
  }
}