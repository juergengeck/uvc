# Pi Authority Demonstrator First Cut

> Superseded for the authority implementation by `groov-quicvc-authority-prd.md`. This document remains the record of the earlier Pi/HTTP first cut.

## Goal

Stand up a demonstrator with four roles:

- `groov EPIC` as the controllable light source
- `Raspberry Pi` as the source of trust and operator-facing control surface
- `ESP32 UVC detector` with the UVC sensor path
- `ESP32 RGB detector` with the RGB sensor path

For the first version, the Pi is the single authority the operator talks to. The mobile app and Expo web route should read state from the Pi and update demonstrator configuration through the Pi instead of talking to each ESP32 directly.

## First-Cut Topology

```text
groov EPIC light source
        ^
        | control
        |
Raspberry Pi (vger.headless-style authority)
        |  \
        |   \ HTTP/WebSocket
        |    \
      mDNS     app + uvc.browser (Expo web)
        |
   ESP32 UVC detector
   ESP32 RGB detector
```

## Runtime Shape

### Pi

The Pi should run a headless runtime patterned after:

- `/Users/gecko/src/vger/packages/vger.headless`
- `/Users/gecko/src/heiner/one.heiner/service/heiner-headless-server.mjs`

The useful pieces to copy are:

- `vger.headless` generic HTTP/WebSocket control surface
- `heiner`-style public discovery aliasing via `/api/headless/status`
- `vger.headless` Linux mDNS helpers:
  - `/Users/gecko/src/vger/packages/vger.headless/src/services/avahi-mdns.ts`
  - `/Users/gecko/src/vger/packages/vger.headless/src/services/avahi-dbus-discovery.ts`

Suggested defaults:

- service host: `uvc-pi.local`
- headless port: `3000`
- public status alias: `http://uvc-pi.local:3000/api/headless/status`

### ESP32 detectors

Each ESP32 should advertise enough identity and capability information for the Pi to classify it as:

- `uvc-detector`
- `rgb-detector`

Expected minimum fields:

- stable `deviceId`
- `deviceType`
- capability list
- current online status
- last sensor reading snapshot

Current hardware assumption for the RGB path:

- RGB sensor breakout: `VEML6040` RGBW color sensor over I2C
- ESP board: Feather-style ESP32 with built-in TFT display, likely an Adafruit ESP32 TFT Feather variant
- Local wiring: keep the `VEML6040` attached to the ESP32 over I2C and let the Pi talk to the ESP32 over the network, not over the same sensor bus

Recommended ESP32-side shape for the RGB detector:

- read `red`, `green`, `blue`, and `white` channels from the `VEML6040`
- optionally derive `lux` and a simple normalized color estimate for the demo UI
- render the current state locally on the TFT so the board works as a standalone demonstrator surface
- advertise capabilities like `rgbw-color-sensor` and `display`

Recommended wiring for the pictured RGB detector:

- `VIN` -> `3V`
- `GND` -> `GND`
- `SDA` -> `SDA`
- `SCL` -> `SCL`

If the board is one of the Adafruit TFT Feather variants, the cleanest hookup is through the onboard `STEMMA QT` I2C connector. If it is a different ESP32 display board, the same four logical connections still apply, but the exact header pin numbers may differ.

### App and Expo web

The app and Expo web now expose a shared route:

- [authority.tsx](/Users/gecko/src/uvc/app/(screens)/network/authority.tsx)

This route assumes a Pi authority endpoint and supports:

- manual Pi URL override
- status refresh
- discovery refresh trigger
- device trust/untrust action
- config JSON editing for the demonstrator

The current default URL is:

- `http://uvc-pi.local:3000`

## API Contract

The client is intentionally tolerant while the Pi implementation settles.

### Preferred all-in-one endpoint

- `GET /api/uvcAuthority/state`

Expected shape:

```json
{
  "status": {
    "service": "uvc.headless",
    "role": "pi-authority",
    "ownerId": "person-id",
    "healthy": true,
    "version": "0.1.0",
    "updatedAt": "2026-05-02T09:30:00.000Z",
    "mdns": {
      "serviceType": "_one-refinio._udp",
      "serviceName": "uvc-pi",
      "host": "uvc-pi.local"
    },
    "endpoints": {
      "status": "http://uvc-pi.local:3000/api/headless/status",
      "api": "http://uvc-pi.local:3000/api/uvcAuthority/state"
    }
  },
  "devices": [
    {
      "id": "esp32-uvc-01",
      "name": "UVC detector",
      "role": "uvc-detector",
      "type": "ESP32",
      "address": "192.168.178.50",
      "port": 49497,
      "online": true,
      "trustState": "trusted",
      "capabilities": ["uvc-sensor", "quicvc"],
      "sensorReadings": [
        { "key": "uvIndex", "value": 2.8 }
      ]
    },
    {
      "id": "esp32-rgb-01",
      "name": "RGB detector",
      "role": "rgb-detector",
      "type": "ESP32",
      "address": "192.168.178.51",
      "port": 49497,
      "online": true,
      "trustState": "trusted",
      "capabilities": ["rgbw-color-sensor", "display", "quicvc"],
      "sensorReadings": [
        { "key": "red", "value": 1320 },
        { "key": "green", "value": 1184 },
        { "key": "blue", "value": 640 },
        { "key": "white", "value": 2048 },
        { "key": "lux", "value": 138.4 }
      ]
    }
  ],
  "config": {
    "discovery": {
      "enabled": true,
      "mode": "mdns",
      "serviceType": "_one-refinio._udp"
    },
    "lightSource": {
      "enabled": true,
      "kind": "groov-epic"
    },
    "detectors": {
      "uvc": { "deviceId": "esp32-uvc-01", "enabled": true },
      "rgb": { "deviceId": "esp32-rgb-01", "enabled": true }
    }
  }
}
```

### Split fallback endpoints

If the Pi exposes split endpoints instead, the client also supports:

- `GET /api/headless/status`
- `GET /api/uvcAuthority/devices`
- `GET /api/uvcAuthority/config`

### Control endpoints

- `POST /api/uvcAuthority/discovery/refresh`
- `POST /api/uvcAuthority/trustDevice`
- `POST /api/uvcAuthority/config`

Suggested request bodies:

```json
{ "deviceId": "esp32-uvc-01", "trusted": true }
```

```json
{
  "config": {
    "lightSource": {
      "enabled": true,
      "intensity": 0.6
    }
  }
}
```

## Discovery and Trust Flow

1. Pi boots `vger.headless`-style runtime and publishes itself over mDNS.
2. Pi discovers both ESP32 detectors over mDNS and/or existing QUICVC/UDP discovery.
3. Pi classifies each detector by capability set and persists operator-visible state.
4. Pi performs the trust action for the ESP32 when approved by the operator.
5. App and Expo web poll or subscribe to the Pi for state and config changes.
6. Operator updates demonstrator config through the Pi, not directly against the detector.

## Repo Changes In This Slice

Implemented here:

- Pi authority types:
  - [headlessAuthority.ts](/Users/gecko/src/uvc/src/types/headlessAuthority.ts)
- Pi authority client:
  - [HeadlessAuthorityService.ts](/Users/gecko/src/uvc/src/services/HeadlessAuthorityService.ts)
- React hook:
  - [useHeadlessAuthority.ts](/Users/gecko/src/uvc/src/hooks/useHeadlessAuthority.ts)
- Shared native/web route:
  - [authority.tsx](/Users/gecko/src/uvc/app/(screens)/network/authority.tsx)

Supporting config additions:

- [NetworkSettingsService.ts](/Users/gecko/src/uvc/src/services/NetworkSettingsService.ts)
- [SettingsManager.ts](/Users/gecko/src/uvc/src/settings/SettingsManager.ts)
- [types.ts](/Users/gecko/src/uvc/src/settings/types.ts)

## Not Done Yet

This slice does not yet implement:

- the Pi runtime itself inside this repo
- Groov EPIC transport/control bindings
- sensor-specific parsing or calibration logic on the Pi
- automatic mDNS lookup from the app when no URL is configured
- WebSocket live updates from the Pi

Those are the next steps once the Pi process is ready to answer the documented endpoints.
