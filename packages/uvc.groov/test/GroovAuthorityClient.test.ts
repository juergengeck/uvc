import assert from 'node:assert/strict';
import test from 'node:test';

import { GroovAuthorityClient } from '../src/GroovAuthorityClient.js';
import {
  decodeGroovAuthorityFrame,
  encodeGroovAuthorityFrame,
  GROOV_AUTHORITY_STREAM_ID,
  GroovAuthorityFrameType,
} from '../src/protocol.js';
import type {
  GroovAuthorityState,
  QuicVCStreamHost,
  QuicVCStreamServiceHandler,
} from '../src/types.js';

const observedState: GroovAuthorityState = {
  authority: {
    service: 'uvc-groov-authority',
    authorityId: 'groov-lab',
    role: 'groov-authority',
    healthy: true,
    updatedAt: '2026-07-15T10:00:00.000Z',
  },
  light: {
    kind: 'digital',
    enabled: true,
    intensity: 1,
    rawValue: true,
    reachable: true,
    ioDevice: 'local',
    moduleIndex: 2,
    channelIndex: 4,
    observedAt: '2026-07-15T10:00:00.000Z',
  },
};

test('reads correlated observed state', async () => {
  const host = new FakeClientHost();
  const client = new GroovAuthorityClient(host, { createRequestId: () => 'read-1' });
  const promise = client.readState('groov-device', { connectionId: 'connection-1' });
  const sent = host.lastSent();
  assert.equal(sent.streamId, GROOV_AUTHORITY_STREAM_ID);
  assert.equal(sent.connectionId, 'connection-1');
  assert.equal(decodeGroovAuthorityFrame(sent.data).frameType, GroovAuthorityFrameType.GetStateRequest);

  host.respond('groov-device', 'connection-1', encodeGroovAuthorityFrame(
    GroovAuthorityFrameType.GetStateResponse,
    'read-1',
    { state: observedState },
  ));
  assert.deepEqual(await promise, observedState);
  client.stop();
});

test('rejects authority errors and missing readback', async () => {
  const host = new FakeClientHost();
  let nextId = 0;
  const client = new GroovAuthorityClient(host, {
    defaultTimeoutMs: 10,
    createRequestId: () => `request-${++nextId}`,
  });
  const denied = client.setLight('groov-device', { enabled: true });
  host.respond('groov-device', 'connection-1', encodeGroovAuthorityFrame(
    GroovAuthorityFrameType.ErrorResponse,
    'request-1',
    { code: 'authorization_denied', message: 'not trusted' },
  ));
  await assert.rejects(denied, /authorization_denied: not trusted/);
  await assert.rejects(
    client.readState('groov-device'),
    /timed out without observed state/,
  );
  client.stop();
});

class FakeClientHost implements QuicVCStreamHost {
  private handler: QuicVCStreamServiceHandler | null = null;
  private sent: Array<{ deviceId: string; streamId: number; data: Uint8Array; connectionId?: string }> = [];

  registerStreamServiceHandler(_streamId: number, handler: QuicVCStreamServiceHandler): () => void {
    this.handler = handler;
    return () => { this.handler = null; };
  }

  async sendStreamData(deviceId: string, streamId: number, data: Uint8Array, connectionId?: string): Promise<void> {
    this.sent.push({ deviceId, streamId, data, ...(connectionId ? { connectionId } : {}) });
  }

  lastSent() {
    const sent = this.sent.at(-1);
    assert.ok(sent);
    return sent;
  }

  respond(deviceId: string, connectionId: string, payload: Uint8Array): void {
    assert.ok(this.handler);
    void this.handler({
      connectionId,
      deviceId,
      streamId: GROOV_AUTHORITY_STREAM_ID,
      payload,
      connection: {
        state: 'established',
        peerPersonId: 'groov-person',
        peerTrustLevel: 'trusted',
      },
      timestamp: Date.now(),
    });
  }
}
