import {describe, expect, it} from 'vitest';

import {
  createGroovControlAuthorityAdapter,
  isUvcAdministratorPeer,
  isUvcControlCommandImport,
  isUvcStateSyncType,
  resolveGroovAuthorityConfiguration,
  resolveUvcAdministratorTrust,
} from './UvcGroovControlRuntime.js';

describe('UvcGroovControlRuntime', () => {
  it('starts the executor in an explicit uncommissioned state without credentials', () => {
    expect(resolveGroovAuthorityConfiguration({})).toEqual({mode: 'uncommissioned'});
  });

  it('rejects partially supplied authority configuration', () => {
    expect(() => resolveGroovAuthorityConfiguration({
      GROOV_MANAGE_API_KEY: 'present-but-never-logged',
    })).toThrow('Incomplete authority configuration');
  });

  it('recognizes a complete authority configuration without exposing its values', () => {
    expect(resolveGroovAuthorityConfiguration({
      GROOV_AUTHORITY_ID: 'rio',
      GROOV_MANAGE_BASE_URL: 'https://localhost',
      GROOV_MANAGE_API_KEY: 'secret',
      GROOV_MODULE_INDEX: '0',
      GROOV_CHANNEL_INDEX: '1',
      GROOV_OUTPUT_KIND: 'digital',
    })).toEqual({mode: 'commissioned'});
  });

  it('fails closed with a correlated authority error until commissioned', async () => {
    const authority = createGroovControlAuthorityAdapter('rio');
    await expect(authority.read('rio')).rejects.toThrow('not commissioned');
    await expect(authority.read('another-device')).rejects.toThrow('unknown hardware device');
  });

  it('identifies the typed UVC state closure admitted from the administrator', () => {
    expect(isUvcStateSyncType('UvcStateTrieRoot')).toBe(true);
    expect(isUvcStateSyncType('UvcControlCommand')).toBe(true);
    expect(isUvcStateSyncType('Access')).toBe(false);
    expect(isUvcStateSyncType('ChatMessage')).toBe(false);
    expect(isUvcControlCommandImport({kind: 'object', type: 'UvcControlCommand'})).toBe(true);
    expect(isUvcControlCommandImport({kind: 'id', type: 'UvcControlCommand'})).toBe(false);
    expect(isUvcControlCommandImport({kind: 'object', type: 'UvcStateTrieNode'})).toBe(false);
  });

  it('trusts only the exact administrator instance certified by active provisioning', () => {
    const state = {
      version: 1,
      status: 'active',
      hardwareDeviceId: 'rio',
      deviceKind: 'groov',
      identity: {
        email: 'groov@devices.uvc.local',
        instanceName: 'rio',
        personId: 'b'.repeat(64),
        instanceId: 'c'.repeat(64),
        publicKey: 'device-key',
        publicSignKey: 'device-sign-key',
        signAlgorithm: 'ed25519',
      },
      administrator: {
        personId: 'a'.repeat(64) as any,
        instanceId: 'd'.repeat(64),
        publicKey: 'administrator-key',
        publicSignKey: 'administrator-sign-key',
        signAlgorithm: 'ed25519',
      },
      grant: {
        $type$: 'UvcAdminRoleGrant',
        ceremonyId: 'ceremony',
        certificate: 'e'.repeat(64) as any,
        administratorPersonId: 'a'.repeat(64) as any,
        devicePersonId: 'b'.repeat(64) as any,
        role: 'admin',
        permissions: ['uvc:state:read', 'uvc:control:write'] as string[],
        grantedAt: 1,
        deviceSignature: 'device-signature',
      },
      grantHash: 'f'.repeat(64),
      updatedAt: 1,
    } as const;
    const credential = {
      id: 'd'.repeat(64),
      credentialSubject: {
        id: 'd'.repeat(64),
        personId: 'a'.repeat(64) as any,
        publicKeyHex: 'administrator-key',
        publicSignKey: 'administrator-sign-key',
        signAlgorithm: 'ed25519',
      },
    } as const;

    expect(resolveUvcAdministratorTrust(state, 'administrator-key', credential)?.trustLevel).toBe('trusted');
    expect(isUvcAdministratorPeer(state, 'a'.repeat(64), 'administrator-key')).toBe(true);
    expect(isUvcAdministratorPeer(state, '9'.repeat(64), 'administrator-key')).toBe(false);
    expect(resolveUvcAdministratorTrust(state, 'another-key', credential)).toBeNull();
    expect(resolveUvcAdministratorTrust(state, 'administrator-key', {
      ...credential,
      credentialSubject: {...credential.credentialSubject, personId: '9'.repeat(64) as any},
    })).toBeNull();
  });
});
