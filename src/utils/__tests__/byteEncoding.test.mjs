import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import test from 'node:test';

import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
} from '../byteEncoding.ts';

test('base64 codec matches the platform-independent wire format', () => {
  for (const value of ['', 'f', 'fo', 'foo', 'comma, quote" and \\', 'nino 📶']) {
    const bytes = new TextEncoder().encode(value);
    const encoded = bytesToBase64(bytes);
    assert.equal(encoded, Buffer.from(bytes).toString('base64'));
    assert.equal(new TextDecoder().decode(base64ToBytes(encoded)), value);
  }
});

test('byte helpers preserve ordering', () => {
  const combined = concatBytes(new Uint8Array([0, 15]), new Uint8Array([16, 255]));
  assert.equal(bytesToHex(combined), '000f10ff');
});

test('base64 decoder rejects malformed data', () => {
  assert.throws(() => base64ToBytes(',bad'), /Invalid base64 data/);
});
