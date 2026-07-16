import assert from 'node:assert/strict';
import test from 'node:test';

import {bytesToHex, encodeDiscoveryPacket} from '../DiscoveryPacket.ts';

test('encodes a discovery service byte followed by UTF-8 JSON', () => {
  const packet = encodeDiscoveryPacket(1, {type: 'app_discovery', name: 'UVC'});

  assert.equal(packet[0], 1);
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(packet.subarray(1))),
    {type: 'app_discovery', name: 'UVC'},
  );
});

test('encodes public key bytes as lowercase hex', () => {
  assert.equal(bytesToHex(new Uint8Array([0, 15, 16, 255])), '000f10ff');
});
