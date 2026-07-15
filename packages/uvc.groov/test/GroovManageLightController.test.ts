import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GroovManageError,
  GroovManageLightController,
  type GroovManageRequest,
  type GroovManageRequester,
  type GroovManageResponse,
} from '../src/GroovManageLightController.js';

const observedAt = new Date('2026-07-14T12:00:00.000Z');

test('writes and reads back a digital output using the documented paths', async () => {
  const { requester, requests } = sequenceRequester([
    { status: 200, body: undefined },
    { status: 200, body: { state: true, qualityError: false } },
  ]);
  const controller = new GroovManageLightController({
    baseUrl: 'https://opto-05-bd-39.local',
    apiKey: 'secret-key',
    ioDevice: 'local',
    moduleIndex: 3,
    channelIndex: 7,
    outputKind: 'digital',
  }, requester, () => observedAt);

  const state = await controller.setLight({ enabled: true });

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.method, 'PUT');
  assert.equal(
    requests[0]?.url.pathname,
    '/manage/api/v1/io/local/modules/3/channels/7/digital/state',
  );
  assert.equal(requests[0]?.headers.apiKey, 'secret-key');
  assert.equal(requests[0]?.body, '{"value":true}');
  assert.equal(requests[1]?.method, 'GET');
  assert.equal(
    requests[1]?.url.pathname,
    '/manage/api/v1/io/local/modules/3/channels/7/digital/status',
  );
  assert.deepEqual(state, {
    kind: 'digital',
    enabled: true,
    intensity: 1,
    rawValue: true,
    reachable: true,
    ioDevice: 'local',
    moduleIndex: 3,
    channelIndex: 7,
    observedAt: observedAt.toISOString(),
  });
});

test('maps normalized analog intensity and verifies numeric readback', async () => {
  const { requester, requests } = sequenceRequester([
    { status: 200, body: undefined },
    { status: 200, body: { value: 5, qualityError: false } },
  ]);
  const controller = new GroovManageLightController({
    baseUrl: 'https://groov.example',
    apiKey: 'key',
    ioDevice: 'local',
    moduleIndex: 1,
    channelIndex: 2,
    outputKind: 'analog',
    analogMin: 0,
    analogMax: 10,
    analogOffValue: 0,
    analogReadbackTolerance: 0.01,
  }, requester, () => observedAt);

  const state = await controller.setLight({ enabled: true, intensity: 0.5 });

  assert.equal(requests[0]?.body, '{"value":5}');
  assert.equal(
    requests[0]?.url.pathname,
    '/manage/api/v1/io/local/modules/1/channels/2/analog/value',
  );
  assert.equal(state.rawValue, 5);
  assert.equal(state.intensity, 0.5);
  assert.equal(state.enabled, true);
});

test('fails when hardware readback does not match the command', async () => {
  const { requester } = sequenceRequester([
    { status: 200, body: undefined },
    { status: 200, body: { state: false } },
  ]);
  const controller = digitalController(requester);

  await assert.rejects(
    controller.setLight({ enabled: true }),
    /Digital readback mismatch/,
  );
});

test('emergency off remains idempotent and still verifies each observation', async () => {
  const { requester, requests } = sequenceRequester([
    { status: 200, body: undefined },
    { status: 200, body: { state: false } },
    { status: 200, body: undefined },
    { status: 200, body: { state: false } },
  ]);
  const controller = digitalController(requester);

  assert.equal((await controller.emergencyOff()).enabled, false);
  assert.equal((await controller.emergencyOff()).enabled, false);
  assert.equal(requests.filter((request) => request.method === 'PUT').length, 2);
});

test('rejects invalid commands, configuration, and channel quality errors', async () => {
  assert.throws(
    () => new GroovManageLightController({
      baseUrl: 'https://groov.example',
      apiKey: '',
      ioDevice: 'local',
      moduleIndex: 0,
      channelIndex: 0,
      outputKind: 'digital',
    }),
    /API key is required/,
  );

  const invalidIntensityController = digitalController(async () => ({ status: 200, body: {} }));
  await assert.rejects(
    invalidIntensityController.setLight({ enabled: true, intensity: Number.NaN }),
    /intensity must be a finite number/,
  );

  const qualityController = digitalController(async () => ({
    status: 200,
    body: { state: false, qualityError: true },
  }));
  await assert.rejects(qualityController.readState(), /quality error/);

  const httpErrorController = digitalController(async () => ({ status: 401, body: {} }));
  await assert.rejects(
    httpErrorController.readState(),
    (error: unknown) => error instanceof GroovManageError && /HTTP 401/.test(error.message),
  );
});

function digitalController(requester: GroovManageRequester): GroovManageLightController {
  return new GroovManageLightController({
    baseUrl: 'https://groov.example',
    apiKey: 'key',
    ioDevice: 'local',
    moduleIndex: 0,
    channelIndex: 0,
    outputKind: 'digital',
  }, requester, () => observedAt);
}

function sequenceRequester(responses: GroovManageResponse[]): {
  requester: GroovManageRequester;
  requests: GroovManageRequest[];
} {
  const requests: GroovManageRequest[] = [];
  const requester: GroovManageRequester = async (request) => {
    requests.push(request);
    const response = responses.shift();
    assert.ok(response, 'Unexpected groov Manage request');
    return response;
  };
  return { requester, requests };
}
