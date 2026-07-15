import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeGroovAuthorityFrame,
  encodeGroovAuthorityFrame,
  GroovAuthorityFrameType,
  GroovAuthorityProtocolError,
} from '../src/protocol.js';

test('round-trips every groov authority frame type', () => {
  for (const frameType of Object.values(GroovAuthorityFrameType)) {
    const encoded = encodeGroovAuthorityFrame(frameType, `request-${frameType}`, {
      nested: { ok: true },
      value: frameType,
    });
    assert.deepEqual(decodeGroovAuthorityFrame(encoded), {
      frameType,
      requestId: `request-${frameType}`,
      payload: {
        nested: { ok: true },
        value: frameType,
      },
    });
  }
});

test('rejects unsupported versions with the correlated request id', () => {
  const encoded = encodeGroovAuthorityFrame(
    GroovAuthorityFrameType.GetStateRequest,
    'read-1',
  );
  encoded[0] = 2;

  assert.throws(
    () => decodeGroovAuthorityFrame(encoded),
    (error: unknown) => {
      assert.ok(error instanceof GroovAuthorityProtocolError);
      assert.equal(error.requestId, 'read-1');
      assert.match(error.message, /Unsupported frame version/);
      return true;
    },
  );
});

test('rejects invalid lengths and non-object JSON payloads', () => {
  const encoded = encodeGroovAuthorityFrame(
    GroovAuthorityFrameType.GetStateRequest,
    'read-2',
  );
  assert.throws(
    () => decodeGroovAuthorityFrame(encoded.slice(0, encoded.length - 1)),
    /Invalid frame length/,
  );

  const requestId = new TextEncoder().encode('array-payload');
  const payload = new TextEncoder().encode('[]');
  const frame = new Uint8Array(8 + requestId.length + payload.length);
  const view = new DataView(frame.buffer);
  view.setUint8(0, 1);
  view.setUint8(1, GroovAuthorityFrameType.GetStateRequest);
  view.setUint16(2, requestId.length, false);
  view.setUint32(4, payload.length, false);
  frame.set(requestId, 8);
  frame.set(payload, 8 + requestId.length);
  assert.throws(() => decodeGroovAuthorityFrame(frame), /payload must be an object/);
});

test('rejects blank request ids and invalid frame types', () => {
  assert.throws(
    () => encodeGroovAuthorityFrame(GroovAuthorityFrameType.GetStateRequest, '   '),
    /Invalid requestId length/,
  );
  assert.throws(
    () => encodeGroovAuthorityFrame(88 as never, 'request'),
    /Unknown frame type/,
  );
});
