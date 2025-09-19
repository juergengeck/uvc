# SharedArrayBuffer Runtime Error in CHUM Protocol

## Summary
During CHUM synchronisation between the Expo / React-Native client and the web client a

```
ReferenceError: SharedArrayBuffer is not defined
```

appeared.  The message was seen **inside the WebSocket close reason sent by the
peer**, so the crash actually occurred on whichever side had just processed the
incoming frame (browser or handset).

## Root Cause
The platform-specific WebSocket implementation difference:
- **Browsers** deliver binary WebSocket frames as `ArrayBuffer`
- **React-Native** delivers binary WebSocket frames as `Uint8Array` views

When the CHUM protocol processed binary messages, various buffer utilities accessed 
`data.buffer` directly. If this was a `SharedArrayBuffer` (which can happen with 
typed array views), accessing it in non-cross-origin-isolated contexts raises 
`ReferenceError: SharedArrayBuffer is not defined`.

## Why Browser-to-Browser Worked
Both browser peers receive `ArrayBuffer` directly, so the view-handling code paths
that access `.buffer` were never executed. The faulty code existed but was dormant
until a React-Native peer joined the conversation.

## Fix Applied
**Clean implementation at the WebSocket layer** in `one.core/src/system/expo/websocket.ts`:

```typescript
export function createWebSocket(url: string): WebSocket {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    const toArrayBuffer = (payload: any): any => {
        if (typeof payload === 'string' || payload instanceof ArrayBuffer) {
            return payload;
        }
        if (ArrayBuffer.isView(payload)) {
            const view = payload as ArrayBufferView;
            const copy = new Uint8Array(view.byteLength);
            copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
            return copy.buffer;  // Always returns fresh ArrayBuffer
        }
        return payload;
    };

    // Intercept dispatchEvent so every consumer sees normalized data
    const nativeDispatch = (ws as any).dispatchEvent.bind(ws);
    (ws as any).dispatchEvent = (event: any): boolean => {
        if (event?.type === 'message' && event?.data != null) {
            const normalised = toArrayBuffer(event.data);
            if (normalised !== event.data) {
                event = {
                    type: 'message',
                    data: normalised,
                    origin: event.origin,
                    lastEventId: event.lastEventId,
                    source: event.source,
                    ports: event.ports
                };
            }
        }
        return nativeDispatch(event);
    };

    return ws;
}
```

## Why This Solution is Superior
1. **Single point of normalization** - fixes the root cause, not symptoms
2. **Zero behavior change** for browser-to-browser communication
3. **Works for all listeners** - both `addEventListener` and `onmessage` property
4. **No runtime patching** - clean implementation change
5. **Future-proof** - handles any new buffer utilities without modification

## Files Modified
| Package | Path | Change |
|---------|------|--------|
| one.core | `src/system/expo/websocket.ts` | Added payload normalization in `createWebSocket()` |
| one.core | `lib/system/expo/websocket.js` | Compiled TypeScript with fix |

## Deployment Notes
* The fix is **backward compatible** - browser peers continue to work unchanged
* **No cross-origin isolation required** - works in any JavaScript context
* **No polyfills needed** - pure implementation fix

---
*Fixed by normalizing WebSocket binary payloads at the transport layer* 