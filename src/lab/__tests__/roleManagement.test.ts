/**
 * Role Management Integration Tests
 *
 * Verifies role anchoring, listing, authority validation (admin restriction),
 * and dynamic role assignment in the UVC lab decentralized architecture.
 */
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startLaneHost } from '../hostSwitch.ts';
import type { LaneHost, SpawnedLaneWorker } from '../hostSwitch.ts';
import type { LaneApiClient } from '../portIpc.ts';

jest.setTimeout(120_000);

const LANE = 'role-test-lane';

let root = '';
let host: LaneHost<string> | undefined;

function spawnWorker(key: string): SpawnedLaneWorker {
  const worker = new Worker(path.join(__dirname, '..', 'laneTestWorker.mjs'));
  const port = {
    postMessage: (message: unknown, transfer?: unknown[]) =>
      worker.postMessage(message, transfer as []),
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
      worker.on('message', data => listener({ data } as MessageEvent));
    },
    start() {},
  };
  worker.postMessage({
    kind: 'lab-key',
    key,
    lane: LANE,
    email: `${key}@lab.local`,
    secret: `lab-${key}`,
    directory: path.join(root, key),
  });
  return {
    port,
    terminate: () => worker.terminate(),
    onError: (callback: (error: Error) => void) => worker.on('error', callback),
  };
}

function clients(): Record<string, LaneApiClient> {
  if (!host) throw new Error('lane host is not running');
  return host.clients;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'uvc-roles-'));
  host = await startLaneHost({ keys: ['admin', 'doctor', 'user'], spawn: spawnWorker });
});

afterAll(async () => {
  await host?.stop();
  host = undefined;
  if (root) await rm(root, { recursive: true, force: true });
});

describe('role management in UVC lane', () => {
  it('identities have their baseline lane role assigned', async () => {
    const { admin, doctor, user } = clients();
    const [aWho, dWho, uWho] = await Promise.all([
      admin.call<{ person: string; role: string }>('uvcLane', 'whoAmI'),
      doctor.call<{ person: string; role: string }>('uvcLane', 'whoAmI'),
      user.call<{ person: string; role: string }>('uvcLane', 'whoAmI'),
    ]);

    expect(aWho.role).toBe('admin');
    expect(dWho.role).toBe('doctor');
    expect(uWho.role).toBe('user');
    expect(aWho.person).toBe(host?.persons.admin);
    expect(dWho.person).toBe(host?.persons.doctor);
    expect(uWho.person).toBe(host?.persons.user);
  });

  it('anchors roles in the decentralized lane', async () => {
    const { admin, doctor } = clients();
    const aAnchor = await admin.call<{ idHash: string; person: string }>('uvcLane', 'ensureRoleAnchor', { lane: LANE });
    const dAnchor = await doctor.call<{ idHash: string; person: string }>('uvcLane', 'ensureRoleAnchor', { lane: LANE });

    expect(aAnchor.idHash).toBeTruthy();
    expect(dAnchor.idHash).toBeTruthy();
    expect(aAnchor.person).toBe(host?.persons.admin);
    expect(dAnchor.person).toBe(host?.persons.doctor);
  });

  it('lists registered roles in the lane', async () => {
    const { admin, doctor } = clients();
    const [adminRoles, doctorRoles] = await Promise.all([
      admin.call<Array<{ role: string; person: string; registeredAt: number; idHash: string }>>(
        'uvcLane',
        'listRoles',
        { lane: LANE }
      ),
      doctor.call<Array<{ role: string; person: string; registeredAt: number; idHash: string }>>(
        'uvcLane',
        'listRoles',
        { lane: LANE }
      ),
    ]);

    expect(Array.isArray(adminRoles)).toBe(true);
    expect(Array.isArray(doctorRoles)).toBe(true);

    const adminRole = adminRoles.find(r => r.role === 'admin');
    expect(adminRole).toBeDefined();
    expect(adminRole?.person).toBe(host?.persons.admin);

    const doctorRole = doctorRoles.find(r => r.role === 'doctor');
    expect(doctorRole).toBeDefined();
    expect(doctorRole?.person).toBe(host?.persons.doctor);
  });

  it('prevents non-admin from assigning roles', async () => {
    const { doctor } = clients();
    await expect(
      doctor.call('uvcLane', 'assignRole', {
        lane: LANE,
        targetPerson: host?.persons.user ?? '',
        roleName: 'admin',
        audience: [host?.persons.doctor ?? ''],
      })
    ).rejects.toThrow(/only the admin role can assign roles/i);
  });

  it('allows admin to issue and assign a role to a participant', async () => {
    const { admin } = clients();
    const audience = [host?.persons.admin ?? '', host?.persons.user ?? ''];
    const result = await admin.call<{ idHash: string; role: string; person: string }>('uvcLane', 'assignRole', {
      lane: LANE,
      targetPerson: host?.persons.user ?? '',
      roleName: 'lamp',
      audience,
    });

    expect(result.idHash).toBeTruthy();
    expect(result.role).toBe('lamp');
    expect(result.person).toBe(host?.persons.user);

    // Verify it is now in the role registry
    const roles = await admin.call<Array<{ role: string; person: string; registeredAt: number; idHash: string }>>(
      'uvcLane',
      'listRoles',
      { lane: LANE }
    );
    const lampRole = roles.find(r => r.role === 'lamp');
    expect(lampRole).toBeDefined();
    expect(lampRole?.person).toBe(host?.persons.user);
  });
});
