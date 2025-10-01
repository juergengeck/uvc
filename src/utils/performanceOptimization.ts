/**
 * Performance Optimization Utilities
 *
 * These utilities help optimize the startup time by:
 * 1. Deferring non-critical operations
 * 2. Batching operations
 * 3. Using lazy initialization
 */

import { InteractionManager } from 'react-native';

/**
 * Defer a function execution until after the initial render
 * Uses requestAnimationFrame for browser compatibility
 */
export function deferUntilAfterRender<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    // Use InteractionManager for React Native
    InteractionManager.runAfterInteractions(() => {
      // Add a small delay to ensure UI has fully rendered
      setTimeout(() => {
        fn().then(resolve).catch(reject);
      }, 10);
    });
  });
}

/**
 * Execute operations in parallel with timeout protection
 */
export async function executeInParallel<T>(
  operations: Array<() => Promise<T>>,
  timeoutMs: number = 5000
): Promise<Array<T | Error>> {
  const withTimeout = (promise: Promise<T>, name: string) => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${name} took > ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  };

  const results = await Promise.allSettled(
    operations.map((op, index) => withTimeout(op(), `Operation ${index}`))
  );

  return results.map(result =>
    result.status === 'fulfilled' ? result.value : result.reason
  );
}

/**
 * Measure and log execution time of an async function
 */
export async function measureTime<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    console.log(`[PERF] ${name}: ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    console.log(`[PERF] ${name} failed after ${Date.now() - startTime}ms`);
    throw error;
  }
}

/**
 * Lazy initialization wrapper
 */
export class LazyInitializer<T> {
  private _value: T | undefined;
  private _initializer: () => Promise<T>;
  private _initPromise: Promise<T> | undefined;

  constructor(initializer: () => Promise<T>) {
    this._initializer = initializer;
  }

  async get(): Promise<T> {
    if (this._value !== undefined) {
      return this._value;
    }

    if (!this._initPromise) {
      this._initPromise = this._initializer().then(value => {
        this._value = value;
        return value;
      });
    }

    return this._initPromise;
  }

  isInitialized(): boolean {
    return this._value !== undefined;
  }

  reset(): void {
    this._value = undefined;
    this._initPromise = undefined;
  }
}

/**
 * Batch multiple operations into a single async call
 */
export class OperationBatcher<T> {
  private queue: Array<{ operation: () => Promise<T>; resolve: (value: T) => void; reject: (error: any) => void }> = [];
  private processing = false;
  private batchDelay: number;

  constructor(batchDelay: number = 10) {
    this.batchDelay = batchDelay;
  }

  async add(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.processBatch();
    });
  }

  private async processBatch() {
    if (this.processing) return;

    this.processing = true;
    await new Promise(resolve => setTimeout(resolve, this.batchDelay));

    const batch = this.queue.splice(0);
    this.processing = false;

    // Process all operations in parallel
    const results = await Promise.allSettled(
      batch.map(item => item.operation())
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        batch[index].resolve(result.value);
      } else {
        batch[index].reject(result.reason);
      }
    });
  }
}

/**
 * Create a memoized version of an async function
 */
export function memoizeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, Promise<ReturnType<T>>>();

  return ((...args: Parameters<T>) => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const promise = fn(...args);
    cache.set(key, promise);

    // Clear from cache on error
    promise.catch(() => cache.delete(key));

    return promise;
  }) as T;
}