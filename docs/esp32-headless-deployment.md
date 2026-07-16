# ESP32 headless identity and discovery

The deployable ESP-IDF project is
`../vger/packages/esp32.core/firmware/esp32-quicvc-project`. The files under
`esp32-reference/` document the protocol but are not a flash target.

## Supported platform contract

- Espressif mDNS is a separately installed component with ESP-IDF 5.x:
  <https://docs.espressif.com/projects/esp-protocols/mdns/docs/latest/en/index.html>
- ESP-IDF security guidance:
  <https://docs.espressif.com/projects/esp-idf/en/latest/esp32/security/security.html>
- NVS encryption and flash encryption:
  <https://docs.espressif.com/projects/esp-idf/en/v5.4/esp32/security/flash-encryption.html>

Production boards must enable Secure Boot, flash encryption, and NVS encryption.
Device signing and encryption private keys are created on the board and stored in
encrypted NVS; they are never returned in provisioning frames or mDNS TXT data.

## Discovery states

An unassigned board publishes `_uvc-provision._udp` with:

- `hardwareDeviceId`
- `bootstrapKey`
- `deviceType=esp32`
- `protocol=uvc-headless-provisioning-v1`
- `capabilities=identity-assignment,device-key-generation,admin-grant`

It must not invent a ONE Person or Instance. After the signed ceremony has made
the admin grant durable, the firmware removes that service and publishes
`_one-refinio._udp` with the assigned `deviceId`, `personId`, transport `pubkey`,
name, device type, platform, and capabilities. Assigned devices remain visible;
ownership is not a silent mode.

The public half of the durable identity is loaded from NVS namespace
`uvc_identity` using keys `instance_id`, `person_id`, `public_key`, and
`display_name`. Missing or malformed fields select bootstrap mode atomically.

## Provisioning security boundary

UVC provisioning uses stream `0x43` and the typed evidence in `@refinio/uvc.core`:

1. a controller signs `UvcIdentityAssignment`;
2. the device generates and persists its keys locally and signs
   `UvcDeviceIdentityProof`;
3. the controller signs `UvcDeviceIdentityCertificate`;
4. the device signs and persists the exact `UvcAdminRoleGrant` before activating
   the administrator.

The peer Person, Instance, signing key, and signing algorithm must come from an
authenticated QUICVC connection. The old service-2 JSON credential endpoint is
not a provisioning authority and is rejected. The current ESP firmware's
`quicvc_transport.c` still contains placeholder connection methods, so raw UDP
and BLE service dispatch fail closed for both old ownership and stream `0x43`.
Do not weaken this check: finish the authenticated QUICVC transport adapter, then
invoke `uvc_headless_accept_assignment` and
`uvc_headless_accept_certificate` from the verified stream callback.

## Build and flash

With ESP-IDF installed and a board connected:

```sh
./set_wifi.sh                  # interactive; password input is hidden
# or, on macOS when the current credential is in Keychain:
./set_wifi.sh --keychain SSID

cd ../vger/packages/esp32.core/firmware/esp32-quicvc-project
idf.py add-dependency espressif/mdns
idf.py build
idf.py -p /dev/cu.usbserial-DEVICE flash monitor
```

`set_wifi.sh` writes the ignored `sdkconfig` in the deployable VGER firmware
project. It does not create a plaintext `wifi_config.tmp` file.

An unowned board can also be connected from Expo: start Bluetooth discovery,
expand the `QUICVC-*` device, and select **Connect to WiFi**. Expo writes a
service-type-9 request to the QUICVC GATT request characteristic and waits for
the response characteristic acknowledgement. The firmware stores the values in
the `wifi_creds` NVS namespace, applies them immediately, and reads them again
on later boots. This proximity bootstrap is rejected after the device has an
owner; subsequent WiFi changes belong on the authenticated QUICVC control path.

Verify first that `_uvc-provision._udp` contains a non-empty bootstrap key. After
assignment, verify that the bootstrap record disappears and the identity-bound
`_one-refinio._udp` record is accepted by Cube's phone book. Then run:

```sh
cd packages/uvc.cube
UVC_QA_EXPECTED_KINDS=cube,groov,esp32 npm run test:integration:probe
```
