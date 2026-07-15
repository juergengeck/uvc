# @uvc/groov-authority

QUICVC application service for controlling and observing a configured groov EPIC output.

The package does not implement QUICVC transport or credentials. Pass the existing `connection.core` `QuicVCConnectionManager` to `createGroovAuthorityRuntime`, provide an explicit authorizer, and start the returned service.

```ts
const { service } = await createGroovAuthorityRuntime({
  quicManager,
  authorize,
});

service.start(); // registers the application handler on QUICVC stream 0x42
```

Required environment variables:

- `GROOV_AUTHORITY_ID`
- `GROOV_MANAGE_BASE_URL`
- `GROOV_MANAGE_API_KEY`
- `GROOV_MODULE_INDEX`
- `GROOV_CHANNEL_INDEX`
- `GROOV_OUTPUT_KIND=digital|analog`

Optional environment variables:

- `GROOV_IO_DEVICE` (defaults to `local`)
- `GROOV_ANALOG_MIN`
- `GROOV_ANALOG_MAX`
- `GROOV_ANALOG_OFF_VALUE`
- `GROOV_ANALOG_READBACK_TOLERANCE`
- `GROOV_REQUEST_TIMEOUT_MS` (defaults to `5000`)
- `GROOV_TLS_CA_FILE`
- `GROOV_TLS_REJECT_UNAUTHORIZED` (defaults to `true`)

The module and channel have no defaults. A process cannot write hardware until both are explicitly configured.
