import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import type {ServerConfig} from '@vger/vger.headless/dist/types.js';

/** Persist the first-claim login before creating the bootstrap ONE instance. */
export function resolveUvcBootstrapCredentials(config: ServerConfig, assigned: boolean): {email: string; secret: string} {
  const storageDir = path.resolve(config.storageDir ?? './vger-data');
  const file = path.join(storageDir, '.credentials');
  if (config.email && config.secret) return {email: config.email, secret: config.secret};
  if (fs.existsSync(file)) {
    const stored: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!stored || typeof stored !== 'object' || !('email' in stored) || !('secret' in stored)
      || typeof stored.email !== 'string' || !stored.email || typeof stored.secret !== 'string' || !stored.secret) {
      throw new Error('[UVC provisioning] Stored login credentials are invalid');
    }
    return {email: config.email ?? stored.email, secret: config.secret ?? stored.secret};
  }
  if (assigned) throw new Error('[UVC provisioning] Assigned identity requires its storage secret');
  const deviceId = process.env.UVC_HARDWARE_DEVICE_ID?.trim() || os.hostname().split('.')[0]!;
  const credentials = {
    email: config.email ?? `${deviceId}@bootstrap.uvc.local`,
    secret: config.secret ?? randomBytes(32).toString('hex'),
  };
  fs.mkdirSync(storageDir, {recursive: true, mode: 0o700});
  const handle = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(handle, JSON.stringify(credentials), 'utf8');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  const directory = fs.openSync(storageDir, 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  return credentials;
}
