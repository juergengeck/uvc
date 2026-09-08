import fs from 'node:fs';
import path from 'node:path';

import type {UvcAdminRoleGrant} from '@refinio/uvc.core';

export interface UvcProvisionedIdentitySecrets {
  personSecretEncryptionKey: string;
  personSecretSignKey: string;
  instanceSecretEncryptionKey: string;
  instanceSecretSignKey: string;
}

export interface UvcHeadlessProvisioningState {
  version: 1;
  status: 'pending' | 'ready' | 'active';
  hardwareDeviceId: string;
  deviceKind: 'groov' | 'esp32';
  identity: {
    email: string;
    instanceName: string;
    personId: string;
    instanceId: string;
    publicKey: string;
    publicSignKey: string;
    signAlgorithm: 'ed25519';
    secrets?: UvcProvisionedIdentitySecrets;
  };
  administrator?: {
    personId: string;
    instanceId: string;
    publicKey: string;
    publicSignKey: string;
    signAlgorithm: 'ed25519' | 'ecdsa-p256-sha256';
  };
  grant?: UvcAdminRoleGrant;
  grantHash?: string;
  updatedAt: number;
}

export function loadUvcHeadlessProvisioningState(
  filePath: string | undefined,
): UvcHeadlessProvisioningState | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<UvcHeadlessProvisioningState>;
  if (
    parsed.version !== 1
    || !parsed.identity
    || typeof parsed.identity.email !== 'string'
    || typeof parsed.identity.instanceName !== 'string'
    || (parsed.status !== 'pending' && parsed.status !== 'ready' && parsed.status !== 'active')
  ) {
    throw new Error(`[UVC provisioning] Invalid state file ${filePath}`);
  }
  return parsed as UvcHeadlessProvisioningState;
}

export function storeUvcHeadlessProvisioningState(
  filePath: string,
  state: UvcHeadlessProvisioningState,
): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const temporary = `${filePath}.tmp-${process.pid}`;
  const handle = fs.openSync(temporary, 'w', 0o600);
  try {
    fs.writeFileSync(handle, `${JSON.stringify(state)}\n`, 'utf8');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
  const directoryHandle = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(directoryHandle);
  } finally {
    fs.closeSync(directoryHandle);
  }
}

export function activateUvcHeadlessProvisioningState(
  filePath: string,
  state: UvcHeadlessProvisioningState,
): UvcHeadlessProvisioningState {
  if (state.status !== 'ready' || !state.grant || !state.grantHash || !state.administrator) {
    throw new Error('[UVC provisioning] Cannot activate incomplete provisioning state');
  }
  const active: UvcHeadlessProvisioningState = {
    ...state,
    status: 'active',
    identity: {
      email: state.identity.email,
      instanceName: state.identity.instanceName,
      personId: state.identity.personId,
      instanceId: state.identity.instanceId,
      publicKey: state.identity.publicKey,
      publicSignKey: state.identity.publicSignKey,
      signAlgorithm: state.identity.signAlgorithm,
    },
    updatedAt: Date.now(),
  };
  storeUvcHeadlessProvisioningState(filePath, active);
  return active;
}
