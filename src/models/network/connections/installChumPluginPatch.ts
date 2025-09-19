// In React-Native (Hermes/Metro) we can monkey-patch the Connection constructor that is
// exported from one.models once – before any Connection objects are created.  This adds
// `ChumPlugin` as soon as the base constructor has finished so that the CHUM control
// messages (e.g. "synchronisation") never reach JSON-expecting plugins.

import type { default as ConnectionCtor } from '@refinio/one.models/lib/misc/Connection/Connection';

let patched = false;

export function installChumPluginPatch() {
  if (patched) {
    return;
  }

  try {
    // Dynamically import the Connection module – this works both in Node and in Metro.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const connectionModule: { default: typeof ConnectionCtor } = require('@refinio/one.models/lib/misc/Connection/Connection');

    const OriginalConnection = connectionModule.default as unknown as typeof ConnectionCtor & { __chumPatched?: boolean };

    if (OriginalConnection.__chumPatched) {
      patched = true;
      return; // another part of the app already patched it
    }

    const { ChumPlugin } = require('../plugins/ChumPlugin');

    class PatchedConnection extends (OriginalConnection as any) {
      constructor(...args: any[]) {
        // @ts-ignore – super types differ but we simply forward the args
        super(...args);

        try {
          // Only attach if not already present (defensive for reconnects)
          if (!this.hasPlugin || !this.hasPlugin('ChumPlugin')) {
            // Insert before PromisePlugin so that control strings are stripped before promises
            this.addPlugin(new ChumPlugin(), { before: 'promise' as any });
          }
        } catch (e) {
          // We must never crash the constructor – just log and continue with a broken sync.
          // eslint-disable-next-line no-console
          console.error('[ChumPluginPatch] Failed to attach ChumPlugin', e);
        }
      }
    }

    // Mark to prevent double patching
    (PatchedConnection as any).__chumPatched = true;

    // Replace the export so that everyone who imports after this point gets the patched one
    connectionModule.default = PatchedConnection as unknown as typeof ConnectionCtor;

    // eslint-disable-next-line no-console
    console.log('[ChumPluginPatch] ✅ Patched Connection constructor – ChumPlugin will now be auto-injected');
    patched = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ChumPluginPatch] ❌ Failed to install patch – CHUM sync will be broken', err);
  }
}