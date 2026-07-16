import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  decodeESP32WiFiProvisioningResponse,
  encodeESP32WiFiProvisioningRequest,
  ESP32_WIFI_BLE,
} from '../ESP32WiFiProvisioningProtocol.ts';

test('encodes credentials as length-prefixed bytes behind service type 9', () => {
  const packet = Buffer.from(encodeESP32WiFiProvisioningRequest('lab', 'comma, quote" and \\'), 'base64');
  assert.equal(packet[0], ESP32_WIFI_BLE.serviceType);
  assert.equal(packet[1], ESP32_WIFI_BLE.protocolVersion);
  assert.equal(packet[2], 3);
  assert.equal(packet[3], 19);
  assert.equal(packet.subarray(4, 7).toString('utf8'), 'lab');
  assert.equal(packet.subarray(7).toString('utf8'), 'comma, quote" and \\');
});

test('decodes a compact firmware acknowledgement', () => {
  const value = Buffer.from([
    ESP32_WIFI_BLE.serviceType,
    ESP32_WIFI_BLE.protocolVersion,
    1,
    1,
  ]).toString('base64');
  assert.deepEqual(decodeESP32WiFiProvisioningResponse(value), {
    deviceId: '',
    success: true,
    status: 'connecting',
  });
});
