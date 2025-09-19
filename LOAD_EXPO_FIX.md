# Fix for one.core/src/system/load-expo.ts

## Problem: Eager Import Causes Metro Bundling Chaos

**Current problematic code (lines 26-38):**
```typescript
import {
    buffer as BUF,
    cryptoHelpers as CH,
    cryptoScrypt as CS,
    fetchFile as FF,
    postJson as PJ,
    promise as PR,
    settingsStore as SS,
    storageBase as SB,
    storageBaseDeleteFile as SBDF,
    storageStreams as SST,
    websocket as WS,
    quicTransport as QT
} from './expo/index.js';
```

**Why this fails:**
- Forces Metro to bundle ALL platform modules immediately
- Creates circular dependency issues with chum-sync and other modules
- Makes module boundaries unclear to Metro bundler

## Solution: Lazy Platform Loading

**Replace the eager imports with lazy loading:**

```typescript
/**
 * @author Michael Hasenstein <hasenstein@yahoo.com>
 * @copyright REFINIO GmbH 2023
 * @license CC-BY-NC-SA-2.5; portions MIT License
 * @version 0.0.1
 */

/**
 * @module
 */

import {setPlatformForCh} from './crypto-helpers.js';
import {setPlatformForCs} from './crypto-scrypt.js';
import {setPlatformForFf} from './fetch-file.js';
import {setPlatformLoaded} from './platform.js';
import {setPlatformForPj} from './post-json.js';
import {setPlatformForPr} from '../util/promise.js';
import {setPlatformForSs} from './settings-store.js';
import {setPlatformForSb} from './storage-base.js';
import {setPlatformForSbdf} from './storage-base-delete-file.js';
import {setPlatformForSst} from './storage-streams.js';
import {setPlatformForWs} from './websocket.js';
import {setPlatformForBuf} from './expo/buffer.js';
import {setPlatformForQt} from './quic-transport.js';

/**
 * Lazy-load platform implementations to avoid Metro bundling chaos
 * This ensures platform modules are only loaded when actually needed
 */
async function loadExpoImplementations() {
    // Import platform implementations lazily
    const [
        BUF,
        CH,
        CS,
        FF,
        PJ,
        PR,
        SS,
        SB,
        SBDF,
        SST,
        WS,
        QT
    ] = await Promise.all([
        import('./expo/buffer.js'),
        import('./expo/crypto-helpers.js'),
        import('./expo/crypto-scrypt.js'),
        import('./expo/fetch-file.js'),
        import('./expo/post-json.js'),
        import('./expo/promise.js'),
        import('./expo/settings-store.js'),
        import('./expo/storage-base.js'),
        import('./expo/storage-base-delete-file.js'),
        import('./expo/storage-streams-impl.js'),
        import('./expo/websocket.js'),
        import('./expo/quic-transport.js')
    ]);

    // Initialize buffer first (as before)
    setPlatformForBuf(BUF);

    // Set all platform implementations
    setPlatformForCh(CH);
    setPlatformForCs(CS);
    setPlatformForFf(FF);
    setPlatformForPj(PJ);
    setPlatformForPr(PR);
    setPlatformForSs(SS);
    setPlatformForSb(SB);
    setPlatformForSbdf(SBDF);
    setPlatformForSst(SST);
    setPlatformForWs(WS);
    setPlatformForQt(QT.implementation);

    setPlatformLoaded('expo');
}

// Execute the lazy loading
loadExpoImplementations().catch(error => {
    console.error('Failed to load Expo platform implementations:', error);
    throw error;
});
```

## Alternative: Selective Lazy Loading

If you want even more control, you can make each platform module load only when first accessed:

```typescript
/**
 * Selective lazy platform loader
 */
const platformCache = new Map<string, any>();

async function loadPlatformModule(name: string) {
    if (!platformCache.has(name)) {
        const module = await import(`./expo/${name}.js`);
        platformCache.set(name, module);
    }
    return platformCache.get(name);
}

// Load and set platform implementations on demand
async function initializeExpoPlatform() {
    // Critical modules first (buffer, crypto)
    const BUF = await loadPlatformModule('buffer');
    setPlatformForBuf(BUF);
    
    const CH = await loadPlatformModule('crypto-helpers');
    setPlatformForCh(CH);
    
    // Other modules can be loaded in parallel
    const [CS, FF, PJ, PR, SS, SB, SBDF, SST, WS, QT] = await Promise.all([
        loadPlatformModule('crypto-scrypt'),
        loadPlatformModule('fetch-file'),
        loadPlatformModule('post-json'),
        loadPlatformModule('promise'),
        loadPlatformModule('settings-store'),
        loadPlatformModule('storage-base'),
        loadPlatformModule('storage-base-delete-file'),
        loadPlatformModule('storage-streams-impl'),
        loadPlatformModule('websocket'),
        loadPlatformModule('quic-transport')
    ]);

    setPlatformForCs(CS);
    setPlatformForFf(FF);
    setPlatformForPj(PJ);
    setPlatformForPr(PR);
    setPlatformForSs(SS);
    setPlatformForSb(SB);
    setPlatformForSbdf(SBDF);
    setPlatformForSst(SST);
    setPlatformForWs(WS);
    setPlatformForQt(QT.implementation);

    setPlatformLoaded('expo');
}

// Initialize platform
initializeExpoPlatform();
```

## Benefits

### ✅ **Eliminates Metro Bundling Chaos**
- No more eager imports of all platform modules
- Metro can bundle modules incrementally
- Clearer module boundaries

### ✅ **Preserves one.core Architecture** 
- Stays within `one.core/src/system/expo`
- Maintains multi-platform support
- No changes to platform interfaces

### ✅ **Fixes Circular Dependencies**
- Platform modules load only when ready
- Reduces initialization-time conflicts
- Better error isolation

### ✅ **Better Performance**
- Faster initial bundle size
- Parallel loading of platform modules
- Can add progressive loading later

## Migration

1. Replace the content of `one.core/src/system/load-expo.ts` with the lazy loading version
2. Test that all platform functionality still works
3. Monitor bundle size and loading performance
4. Consider extending this pattern to other platform loaders (load-node.ts, etc.)

This fix **stays within the one.core architecture** while solving the Metro bundling chaos caused by eager imports. 