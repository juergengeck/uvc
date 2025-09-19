# ESP32 Ownership Removal - Current Status

## Summary
The ownership removal feature has been implemented on the app side but requires ESP32 firmware updates to fully function.

## Current Behavior

### What Works
1. **App sends ownership removal command** via service type 2
2. **Local state is cleared** - device appears as unowned in the app
3. **Journal entries are created** for audit trail
4. **Visual feedback works** - device card shows loading state during removal

### What Doesn't Work
1. **ESP32 doesn't process the removal command** - firmware doesn't handle service type 2 for ownership removal
2. **Device still has old credential** - when re-authenticated, it presents the same owner credential
3. **Ownership persists on device** - the ESP32's NVS still contains the old ownership data

## Root Cause
The ESP32 firmware needs to be updated to:
1. Handle messages on service type 2 (CREDENTIALS)
2. Parse the `ownership_remove` command
3. Clear the stored credential from NVS
4. Create verifiable journal entries
5. Restart the device for clean state

## Temporary Workaround
The app now:
- Removes ownership locally even if the device doesn't respond
- Waits 3 seconds for device processing (though it won't happen without firmware update)
- Logs warnings about the firmware limitation

## ESP32 Firmware Implementation Required

The ESP32 needs to implement the handler from `esp32-ownership-removal-handler.c`:

```c
// Handle service type 2 messages
case 2: // CREDENTIALS (now used for ownership removal)
    handle_credentials_service_message(data, len, source);
    break;
```

And process the ownership removal:
```json
{
  "type": "ownership_remove",
  "deviceId": "esp32-xxx",
  "senderPersonId": "owner-person-id",
  "timestamp": 1234567890
}
```

## User Experience Impact
- Users can "remove" ownership in the app, but the device won't actually be unclaimed
- The device will re-appear as owned when the app restarts or re-discovers it
- To truly unclaim the device, the ESP32 must be factory reset or the firmware updated

## Next Steps
1. Update ESP32 firmware to handle service type 2 ownership removal
2. Test the complete flow with updated firmware
3. Consider adding a "factory reset" command as an alternative