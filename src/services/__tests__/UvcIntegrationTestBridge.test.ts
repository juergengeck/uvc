import {
  parseUvcIntegrationControlUrl,
  runUvcIntegrationControlAction,
  type UvcIntegrationDeviceControl,
} from '../UvcIntegrationTestBridge';

const PERSON = 'a'.repeat(64);

describe('UvcIntegrationTestBridge', () => {
  it('requires the integration secret and validates the action', () => {
    const envelope = encodeURIComponent(JSON.stringify({
      secret: 'test-secret',
      action: {
        actionId: 'cycle-1',
        operation: 'esp32-led-cycle',
        deviceId: 'esp32-1',
        executorPersonId: PERSON,
      },
    }));
    const url = `uvc.one://integration/uvc-control#${envelope}`;
    expect(parseUvcIntegrationControlUrl(url, 'test-secret')).toEqual({
      actionId: 'cycle-1',
      operation: 'esp32-led-cycle',
      deviceId: 'esp32-1',
      executorPersonId: PERSON,
    });
    expect(() => parseUvcIntegrationControlUrl(url, 'wrong')).toThrow('unauthenticated');
    expect(parseUvcIntegrationControlUrl('uvc.one://invites/invitePartner/', 'test-secret')).toBeUndefined();
  });

  it('waits for readback before advancing through the LED cycle', async () => {
    let enabled = false;
    const calls: string[] = [];
    const control: UvcIntegrationDeviceControl = {
      readLight: async target => {
        calls.push(`read:${target.executorPersonId}:${String(enabled)}`);
        return state(enabled);
      },
      setLight: async (target, desired) => {
        enabled = desired.enabled;
        calls.push(`set:${target.executorPersonId}:${String(enabled)}`);
        return state(enabled);
      },
    };
    await runUvcIntegrationControlAction(control, {
      actionId: 'cycle-1',
      operation: 'esp32-led-cycle',
      deviceId: 'esp32-1',
      executorPersonId: PERSON as never,
    });
    expect(calls).toEqual([
      `read:${PERSON}:false`,
      `set:${PERSON}:true`,
      `set:${PERSON}:false`,
      `set:${PERSON}:false`,
      `read:${PERSON}:false`,
    ]);
  });
});

function state(enabled: boolean) {
  return {
    enabled,
    observedAt: new Date(0).toISOString(),
    producerDeviceId: 'esp32-1',
  };
}
