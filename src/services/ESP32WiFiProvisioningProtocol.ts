import {base64ToBytes, bytesToBase64, concatBytes} from '../utils/byteEncoding.ts';

export const ESP32_WIFI_BLE = {
  service: '9bdf81ee-8d22-40be-b075-9b5baf9c7880',
  request: '9bdf81ee-8d22-40be-b075-9b5baf9c7881',
  response: '9bdf81ee-8d22-40be-b075-9b5baf9c7882',
  serviceType: 9,
  protocolVersion: 1,
} as const;

export interface ESP32WiFiProvisioningResult {
  deviceId: string;
  success: boolean;
  status: string;
  message?: string;
}

export function encodeESP32WiFiProvisioningRequest(ssid: string, password: string): string {
  const ssidBytes = new TextEncoder().encode(ssid);
  const passwordBytes = new TextEncoder().encode(password);
  if (ssidBytes.length === 0) throw new Error('WiFi network name is required');
  if (ssidBytes.length > 31) {
    throw new Error('WiFi network name must be at most 31 bytes');
  }
  if (passwordBytes.length > 63) {
    throw new Error('WiFi password must be at most 63 bytes');
  }
  return bytesToBase64(concatBytes(
    new Uint8Array([
      ESP32_WIFI_BLE.serviceType,
      ESP32_WIFI_BLE.protocolVersion,
      ssidBytes.length,
      passwordBytes.length,
    ]),
    ssidBytes,
    passwordBytes,
  ));
}

export function decodeESP32WiFiProvisioningResponse(value: string): ESP32WiFiProvisioningResult {
  const packet = base64ToBytes(value);
  if (
    packet.length !== 4 ||
    packet[0] !== ESP32_WIFI_BLE.serviceType ||
    packet[1] !== ESP32_WIFI_BLE.protocolVersion
  ) {
    throw new Error('ESP32 returned an invalid WiFi provisioning response');
  }
  const success = packet[2] === 1;
  const status = packet[3] === 1 ? 'connecting' : 'failed';
  return {
    deviceId: '',
    success,
    status,
    ...(!success ? {message: 'ESP32 could not store the WiFi credentials'} : {}),
  };
}
