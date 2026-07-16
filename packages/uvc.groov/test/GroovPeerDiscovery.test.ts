import assert from 'node:assert/strict';
import test from 'node:test';

import {buildGroovTxtRecord} from '../src/GroovPeerDiscovery.js';
import {buildGroovProvisioningTxtRecord} from '../src/GroovProvisioningDiscovery.js';

test('Groov advertisement is bound to Person and Instance identity', () => {
  const txt = buildGroovTxtRecord({
    personId: 'a'.repeat(64),
    instanceId: 'b'.repeat(64),
    publicKey: 'c'.repeat(64),
    displayName: 'rio',
    port: 49497,
  });
  assert.equal(txt.deviceType, 'groov');
  assert.equal(txt.personId, 'a'.repeat(64));
  assert.equal(txt.deviceId, 'b'.repeat(64));
  assert.match(txt.capabilities!, /phone-book/);
});

test('unprovisioned Groov advertises hardware reachability without a fake ONE identity', () => {
  const txt = buildGroovProvisioningTxtRecord({
    hardwareDeviceId: 'groov-rio-1',
    bootstrapPublicKey: 'bootstrap-key',
    displayName: 'rio',
    port: 49497,
  });
  assert.equal(txt.protocol, 'uvc-headless-provisioning-v1');
  assert.equal(txt.hardwareDeviceId, 'groov-rio-1');
  assert.equal(txt.personId, undefined);
  assert.equal(txt.deviceId, undefined);
});
