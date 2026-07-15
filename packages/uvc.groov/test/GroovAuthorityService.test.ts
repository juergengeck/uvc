import assert from 'node:assert/strict';
import test from 'node:test';

import { GroovAuthorityService } from '../src/GroovAuthorityService.js';
import {
  decodeGroovAuthorityFrame,
  encodeGroovAuthorityFrame,
  GROOV_AUTHORITY_STREAM_ID,
  GroovAuthorityFrameType,
} from '../src/protocol.js';
import type {
  GroovAuthorityAuthorizationRequest,
  LightCommand,
  LightController,
  LightState,
  QuicVCStreamHost,
  QuicVCStreamServiceHandler,
  QuicVCStreamServiceMessage,
} from '../src/types.js';

const baseState: LightState = {
  kind: 'digital',
  enabled: false,
  intensity: 0,
  rawValue: false,
  reachable: true,
  ioDevice: 'local',
  moduleIndex: 2,
  channelIndex: 4,
  observedAt: '2026-07-14T12:00:00.000Z',
};

test('registers stream 0x42 and serves a correlated state read', async () => {
  const host = new FakeStreamHost();
  const controller = new FakeLightController();
  const authorizationRequests: GroovAuthorityAuthorizationRequest[] = [];
  const service = new GroovAuthorityService(
    host,
    controller,
    (request) => {
      authorizationRequests.push(request);
      return { allowed: true, reason: 'test policy' };
    },
    { authorityId: 'groov-lab' },
  );

  service.start();
  service.start();
  assert.equal(host.registeredStreamId, GROOV_AUTHORITY_STREAM_ID);
  assert.equal(host.registrationCount, 1);

  await host.deliver(requestMessage(
    GroovAuthorityFrameType.GetStateRequest,
    'state-1',
  ));

  assert.equal(controller.readCount, 1);
  assert.deepEqual(authorizationRequests, [{
    operation: 'read',
    deviceId: 'client-device',
    connectionId: 'connection-1',
    peerPersonId: 'person-id',
    peerTrustLevel: 'trusted',
  }]);
  const response = host.lastFrame();
  assert.equal(response.frameType, GroovAuthorityFrameType.GetStateResponse);
  assert.equal(response.requestId, 'state-1');
  assert.deepEqual(response.payload, {
    state: {
      authority: {
        service: 'uvc-groov-authority',
        authorityId: 'groov-lab',
        role: 'groov-authority',
        healthy: true,
        updatedAt: baseState.observedAt,
      },
      light: baseState,
    },
  });

  service.stop();
  assert.equal(host.unregisterCount, 1);
});

test('dispatches validated set and emergency-off operations', async () => {
  const host = new FakeStreamHost();
  const controller = new FakeLightController();
  const operations: string[] = [];
  const service = new GroovAuthorityService(
    host,
    controller,
    ({ operation }) => {
      operations.push(operation);
      return { allowed: true, reason: 'allowed' };
    },
    { authorityId: 'groov-lab' },
  );
  service.start();

  await host.deliver(requestMessage(
    GroovAuthorityFrameType.SetLightRequest,
    'write-1',
    { enabled: true, intensity: 0.75 },
  ));
  await host.deliver(requestMessage(
    GroovAuthorityFrameType.EmergencyOffRequest,
    'off-1',
  ));
  await host.deliver(requestMessage(
    GroovAuthorityFrameType.EmergencyOffRequest,
    'off-2',
  ));

  assert.deepEqual(controller.commands, [{ enabled: true, intensity: 0.75 }]);
  assert.equal(controller.emergencyOffCount, 2);
  assert.deepEqual(operations, ['write', 'emergencyOff', 'emergencyOff']);
  assert.deepEqual(
    host.sent.map((sent) => decodeGroovAuthorityFrame(sent.data).requestId),
    ['write-1', 'off-1', 'off-2'],
  );
});

test('fails closed before hardware access when peer authorization is denied', async () => {
  const host = new FakeStreamHost();
  const controller = new FakeLightController();
  const service = new GroovAuthorityService(
    host,
    controller,
    () => ({ allowed: false, reason: 'peer lacks output-control role' }),
    { authorityId: 'groov-lab' },
  );
  service.start();

  await host.deliver(requestMessage(
    GroovAuthorityFrameType.SetLightRequest,
    'denied-1',
    { enabled: true },
  ));

  assert.equal(controller.commands.length, 0);
  const response = host.lastFrame();
  assert.equal(response.frameType, GroovAuthorityFrameType.ErrorResponse);
  assert.equal(response.requestId, 'denied-1');
  assert.deepEqual(response.payload, {
    code: 'authorization_denied',
    message: 'peer lacks output-control role',
  });
});

test('rejects missing identity, unestablished connections, and malformed commands', async () => {
  const host = new FakeStreamHost();
  const controller = new FakeLightController();
  let authorizeCount = 0;
  const service = new GroovAuthorityService(
    host,
    controller,
    () => {
      authorizeCount += 1;
      return { allowed: true, reason: 'allowed' };
    },
    { authorityId: 'groov-lab' },
  );
  service.start();

  const noIdentity = requestMessage(GroovAuthorityFrameType.GetStateRequest, 'identity-1');
  noIdentity.connection.peerPersonId = null;
  await host.deliver(noIdentity);

  const handshake = requestMessage(GroovAuthorityFrameType.GetStateRequest, 'handshake-1');
  handshake.connection.state = 'handshake';
  await host.deliver(handshake);

  await host.deliver(requestMessage(
    GroovAuthorityFrameType.SetLightRequest,
    'invalid-1',
    { enabled: 'yes' },
  ));

  assert.equal(authorizeCount, 1, 'only the established identified malformed command reaches policy');
  assert.equal(controller.readCount, 0);
  assert.equal(controller.commands.length, 0);
  assert.deepEqual(
    host.sent.map((sent) => decodeGroovAuthorityFrame(sent.data).payload.code),
    ['peer_identity_missing', 'connection_not_established', 'protocol_error'],
  );
});

class FakeStreamHost implements QuicVCStreamHost {
  handler: QuicVCStreamServiceHandler | null = null;
  registeredStreamId: number | null = null;
  registrationCount = 0;
  unregisterCount = 0;
  sent: Array<{ deviceId: string; streamId: number; data: Uint8Array; connectionId?: string }> = [];

  registerStreamServiceHandler(
    streamId: number,
    handler: QuicVCStreamServiceHandler,
  ): () => void {
    this.registeredStreamId = streamId;
    this.handler = handler;
    this.registrationCount += 1;
    return () => {
      this.handler = null;
      this.unregisterCount += 1;
    };
  }

  async sendStreamData(
    deviceId: string,
    streamId: number,
    data: Uint8Array,
    connectionId?: string,
  ): Promise<void> {
    this.sent.push({
      deviceId,
      streamId,
      data,
      ...(connectionId !== undefined ? { connectionId } : {}),
    });
  }

  async deliver(message: QuicVCStreamServiceMessage): Promise<void> {
    assert.ok(this.handler, 'Service has not registered a stream handler');
    await this.handler(message);
  }

  lastFrame() {
    const sent = this.sent.at(-1);
    assert.ok(sent, 'No response was sent');
    assert.equal(sent.streamId, GROOV_AUTHORITY_STREAM_ID);
    assert.equal(sent.connectionId, 'connection-1');
    return decodeGroovAuthorityFrame(sent.data);
  }
}

class FakeLightController implements LightController {
  readCount = 0;
  emergencyOffCount = 0;
  commands: LightCommand[] = [];

  async readState(): Promise<LightState> {
    this.readCount += 1;
    return { ...baseState };
  }

  async setLight(command: LightCommand): Promise<LightState> {
    this.commands.push(command);
    return {
      ...baseState,
      enabled: command.enabled,
      intensity: command.intensity ?? (command.enabled ? 1 : 0),
      rawValue: command.enabled,
    };
  }

  async emergencyOff(): Promise<LightState> {
    this.emergencyOffCount += 1;
    return { ...baseState };
  }
}

function requestMessage(
  frameType: GroovAuthorityFrameType,
  requestId: string,
  payload: Record<string, unknown> = {},
): QuicVCStreamServiceMessage {
  return {
    connectionId: 'connection-1',
    deviceId: 'client-device',
    streamId: GROOV_AUTHORITY_STREAM_ID,
    payload: encodeGroovAuthorityFrame(frameType, requestId, payload),
    connection: {
      state: 'established',
      peerPersonId: 'person-id',
      peerTrustLevel: 'trusted',
    },
    timestamp: Date.now(),
  };
}
