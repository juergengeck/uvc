import ConnectionPlugin, {
  type ConnectionIncomingEvent,
  type ConnectionOutgoingEvent,
} from '@refinio/one.models/lib/misc/Connection/ConnectionPlugin';

/**
 * ChumPlugin – allows CHUM-protocol control strings (e.g. "synchronisation")
 * to pass through to the proper CHUM protocol handler while preventing them from
 * reaching JSON-expecting plugins such as PromisePlugin.
 * 
 * CRITICAL FIX: This plugin should NOT drop CHUM messages. Instead, it should
 * allow them to reach the ConnectionsModel's built-in CHUM protocol handler.
 */
export class ChumPlugin extends ConnectionPlugin {
  constructor() {
    super('ChumPlugin');
  }

  /**
   * Incoming events flow THROUGH the plugin chain. For CHUM control strings,
   * we need to let them pass through to the CHUM protocol handler, not drop them.
   * 
   * The WSRQ-JRMH1 error was caused by dropping the "synchronisation" message
   * instead of allowing the CHUM protocol to handle it properly.
   */
  public transformIncomingEvent(
    event: ConnectionIncomingEvent
  ): ConnectionIncomingEvent | null {
    if (event.type === 'message' && typeof event.data === 'string') {
      if (event.data.includes('synchronisation')) {
        console.log('[ChumPlugin] CHUM sync request - passing to protocol handler');
        
        // CRITICAL: Do NOT drop this event (return null)
        // The ConnectionsModel has a built-in CHUM protocol handler that needs to receive this message
        // Dropping it causes WSRQ-JRMH1 errors because the browser expects a response
        return event; // Let it continue to the CHUM protocol handler
      }
      
      // Check for CHUM request/response messages with object hashes (minimal logging)
      try {
        const msgData = JSON.parse(event.data);
        
        // Only log errors - reduce noise from normal request/response cycle
        if (msgData.type === 'error') {
          console.log(`[ChumPlugin] ❌ CHUM ERROR: ${msgData.error?.message?.substring(0, 100)}...`);
        }
        
      } catch (e) {
        // Silent catch for non-JSON messages
      }
    }
    return event;
  }

  /**
   * Outgoing events: we don't need to modify these for CHUM protocol
   */
  public transformOutgoingEvent(
    event: ConnectionOutgoingEvent
  ): ConnectionOutgoingEvent | null {
    return event;
  }
} 