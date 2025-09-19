# ESP32 Provisioning Diagnostic Guide

## Expected Behavior

### Before Provisioning (Unclaimed Device)
1. Device broadcasts discovery messages every 5 seconds
2. Discovery messages contain: `ownership: "unclaimed"`
3. App receives: `isOwned: false, ownerId: undefined`
4. Log messages should show:
   - `📢 Device is UNCLAIMED - sending discovery broadcast`
   - `Discovery cycle X: enabled=1, owned=0`

### During Provisioning
1. App sends credential to device (service type 2)
2. Device receives and stores credential in NVS
3. Device should immediately:
   - Log: `🔐 Received credential service message`
   - Log: `🚨 PROVISIONING COMPLETE - Calling on_device_provisioned()`
   - Log: `✅ Credential verified in NVS - device is now OWNED`
   - Log: `🔴 on_device_provisioned() CALLED - STOPPING DISCOVERY`
   - Stop the discovery task or disable broadcasts

### After Provisioning (Claimed Device)
1. Device MUST NOT broadcast discovery messages
2. Device only sends heartbeats to connected peers (unicast)
3. Log messages should show:
   - `🔒 Device is OWNED - skipping discovery broadcast`
   - `Discovery cycle X: enabled=0, owned=1` OR
   - `Discovery cycle X: enabled=1, owned=1` with `🔒 Skipping broadcast - device is OWNED`

## Current Issue
The device continues broadcasting as unclaimed even after provisioning completes successfully.

## Debug Steps

### 1. Flash with Debug Firmware
```bash
./flash-esp32-debug.sh /dev/cu.usbserial-0001 "YourSSID" "YourPassword"
```

### 2. Monitor Key Log Messages
Watch for these critical messages in order:

```
[UnifiedService] 📨 Service message type 2 from X.X.X.X:YYYY
[UnifiedService] 📨 Forwarding to credential handler
[ESP32_CREDENTIALS] 🔐 Received credential service message (XXX bytes)
[ESP32_CREDENTIALS] Processing credential message type: provision_device
[ESP32_CREDENTIALS] Storing device credential in NVS
[ESP32_CREDENTIALS] 🚨 PROVISIONING COMPLETE - Calling on_device_provisioned()
[UnifiedService] 🔴 on_device_provisioned() CALLED - STOPPING DISCOVERY
[UnifiedService] ✅ Confirmed: Device IS owned - stopping broadcasts
[UnifiedService] 🛑 Stopping discovery broadcasts - device is now owned
```

### 3. Check Discovery Task Status
After provisioning, you should see:
- Either: Discovery task terminated (no more discovery cycle logs)
- Or: `Discovery cycle X: enabled=0, owned=1`
- Or: `🔒 Skipping broadcast - device is OWNED`

### 4. Verify NVS Storage
The `is_device_owned()` function should report:
- `is_device_owned: TRUE - Owner: XXXXXXXXXX... (len=64)`

## Possible Failure Points

### A. Credential Not Stored
- Check: `is_device_owned: FALSE - No owner ID stored`
- Fix: Verify NVS write succeeded

### B. Discovery Task Not Stopped
- Check: Discovery cycles continue with `enabled=1`
- Fix: Ensure `stop_discovery_broadcasts()` actually deletes task

### C. Ownership Check Failing
- Check: `is_device_owned: FALSE - Invalid owner ID length`
- Fix: Ensure full 64-char Person ID is stored

### D. Callback Not Called
- Check: Missing `🔴 on_device_provisioned() CALLED`
- Fix: Verify credential handler calls the callback

### E. Task Handle Issue
- Check: `discovery_task_handle` is NULL when trying to stop
- Fix: Ensure task handle is properly stored when created

## Test Commands

### From the App
1. Discover device: Should see broadcasts
2. Provision device: Send credential
3. Check discovery stops: No more broadcasts after provisioning

### Manual Test with netcat
```bash
# Listen for broadcasts (should stop after provisioning)
nc -ul 49497

# Send test provision message (replace with actual)
echo -n -e '\x02{"type":"provision_device","credential":{...},"senderPersonId":"..."}' | nc -u esp32-ip 49497
```

## Success Criteria
✅ Discovery broadcasts stop immediately after provisioning
✅ `is_device_owned()` returns true
✅ No "unclaimed" messages after provisioning
✅ App shows device as owned
✅ LED control works (requires ownership)