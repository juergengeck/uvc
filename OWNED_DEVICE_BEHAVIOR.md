# Owned Device Behavior

## Overview
Once a device is owned (paired with a user), its network behavior should change to be more efficient and secure.

## Owned Device Behavior

### 1. Discovery Silence
- **Stop broadcasting discovery messages** - Owned devices should not advertise themselves
- **Stop responding to discovery requests** - No need to be discoverable by others
- **Maintain active connections** - Keep established connections alive

### 2. Status Polling
- **Regular status checks** - Poll owned devices every 30-60 seconds
- **Credential verification** - Verify ownership on each poll
- **Connection health monitoring** - Detect and handle disconnections

### 3. Direct Communication
- **Use known addresses** - Connect directly using stored IP:port
- **Persistent connections** - Maintain long-lived QUIC connections
- **Automatic reconnection** - Reconnect if connection drops

## Implementation for ESP32

### ESP32 Firmware Changes Needed
```c
// Track ownership state
static bool is_owned = false;
static char owner_person_id[65] = {0};

// In credential verification handler
if (verify_ownership_credential(credential)) {
    is_owned = true;
    strcpy(owner_person_id, credential.owner_id);
    // Stop discovery broadcasts
    stop_discovery_timer();
}

// In discovery broadcast function
void send_discovery_broadcast() {
    if (is_owned) {
        // Silent mode - don't broadcast
        return;
    }
    // Normal discovery broadcast...
}

// In discovery request handler  
void handle_discovery_request() {
    if (is_owned) {
        // Don't respond to discovery when owned
        return;
    }
    // Normal discovery response...
}
```

### App-Side Implementation

1. **After Ownership Established**
   - Store device credentials
   - Start status polling timer
   - Stop discovery for that device type

2. **Status Polling Service**
   ```typescript
   class OwnedDevicePoller {
     private pollingInterval = 30000; // 30 seconds
     
     async pollDevice(device: Device) {
       // 1. Send status request
       // 2. Verify credentials
       // 3. Update device state
       // 4. Handle any state changes
     }
   }
   ```

3. **Connection Management**
   - Maintain device registry with last known addresses
   - Track connection health
   - Automatic reconnection on failure

## Benefits

1. **Reduced Network Traffic** - No unnecessary discovery broadcasts
2. **Better Security** - Owned devices are "invisible" to others
3. **Improved Performance** - Direct connections without discovery overhead
4. **Better User Experience** - Devices stay connected and responsive

## Migration Path

1. **Phase 1** - Implement ownership tracking in ESP32 firmware
2. **Phase 2** - Add discovery silence mode when owned
3. **Phase 3** - Implement app-side polling service
4. **Phase 4** - Add connection persistence and auto-reconnect