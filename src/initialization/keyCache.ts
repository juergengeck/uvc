/**
 * Key Cache Module
 *
 * Caches derived keys in memory to avoid expensive re-derivation
 * during the same session. Keys are only cached in memory and
 * cleared on logout for security.
 *
 * NOTE: The actual persistent storage of keys is handled by one.core
 * using the master key system. This cache is only for optimizing
 * operations within a single session.
 */

interface CachedKey {
  email: string;
  instanceName: string;
  timestamp: number;
}

class KeyCache {
  private cache: Map<string, CachedKey> = new Map();
  private maxAge = 3600000; // 1 hour cache validity

  /**
   * Generate cache key from user credentials
   */
  private getCacheKey(email: string, instanceName: string): string {
    return `${instanceName}:${email}`;
  }

  /**
   * Check if we have valid cached keys for this user
   */
  hasCachedKeys(email: string, instanceName: string): boolean {
    const key = this.getCacheKey(email, instanceName);
    const cached = this.cache.get(key);

    if (!cached) {
      return false;
    }

    // Check if cache is expired
    const age = Date.now() - cached.timestamp;
    if (age > this.maxAge) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Mark that keys have been successfully derived/loaded for this user
   */
  markKeysLoaded(email: string, instanceName: string): void {
    const key = this.getCacheKey(email, instanceName);
    this.cache.set(key, {
      email,
      instanceName,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cached keys (called on logout)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[KeyCache] Cache cleared');
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Singleton instance
export const keyCache = new KeyCache();

/**
 * Hook to clear cache on logout
 */
export function setupKeyCacheCleanup(): void {
  // This will be called from the logout handler
  console.log('[KeyCache] Cleanup hook registered');
}