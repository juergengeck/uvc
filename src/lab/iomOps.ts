/**
 * IoM (self-device) invitations for the UVC lab lane.
 *
 * A lane role's Person id derives from its email, so a second device that
 * registers with the exact same email reproduces the exact same Person id
 * with fresh instance keys. A same-person pairing invitation then authorizes
 * the new instance keys under a one-time token, and the stack reports the
 * link as Internet of Me. Pairing never transfers identity; the invite only
 * introduces the two instances over the Glue commserver neither side could
 * replace by listening directly (workers and phones cannot listen). The
 * local role mesh stays on host-switched `lab:` MessagePorts; only IoM
 * discovery and pairing use this dedicated ConnectionsModel.
 *
 * Realm-only module: it drives the pairing manager, so it loads inside the
 * worker realm next to laneInstance, never in jest. URL validation itself
 * is the pure iomInvite codec, tested there.
 */

import { PAIRING_PROTOCOL_VERSION } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import { buildUvcIoMInviteUrl, decodeUvcIoMInvite } from './iomInvite.ts';

/** Commserver carrying lane IoM discovery and pairing (Glue service). */
export const DEFAULT_COMM_SERVER_URL = 'wss://api.glue.one/comm';

interface PairingInvitation {
  token: string;
  url: string;
  publicKey: string;
}

interface LanePairing {
  createInvitation(
    myPersonId?: string,
    token?: string,
    options?: { mode?: string; identityRelation?: string; deviceEnrollmentPersonId?: string },
  ): Promise<PairingInvitation>;
  connectUsingInvitation(
    invitation: Record<string, unknown>,
    myPersonId?: string,
    options?: { mode?: string },
  ): Promise<void>;
  onPairingSuccess: {
    listen(callback: (...args: unknown[]) => void): () => void;
  };
}

interface PendingPairing {
  promise: Promise<void>;
  cancel(): void;
}

export interface IoMDeps {
  connections: ConnectionsModel;
  /** Instance owner Person id hash. */
  self(): string;
  /** Instance owner email; IoM invitations name it as the identity hint. */
  email: string;
  /** Lane entry URL prefix the QR-encoded invitation links back to. */
  appBaseUrl: string;
}

function unref(timer: unknown): void {
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    unref(timer);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Resolve once the pairing with this token commits on our side. */
function watchPairingToken(pairing: LanePairing, token: string): PendingPairing {
  let settled = false;
  let unlisten = (): void => undefined;
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const settle = (error?: Error): void => {
    if (settled) return;
    settled = true;
    unlisten();
    if (error) rejectPromise(error);
    else resolvePromise();
  };
  try {
    const listener = pairing.onPairingSuccess.listen((...args: unknown[]) => {
      if (args[5] !== token) return;
      settle();
    });
    // Some event implementations can invoke the listener synchronously from
    // listen(). Preserve cleanup even in that case.
    if (settled) listener();
    else unlisten = listener;
  } catch (error) {
    settle(error instanceof Error ? error : new Error(String(error)));
  }
  return {
    promise,
    cancel() {
      settle(new Error('UVC lab: IoM pairing wait cancelled.'));
    },
  };
}

export function createIoMOps({ connections, self, email, appBaseUrl }: IoMDeps): {
  createIoMInvite(): Promise<{ invitationUrl: string; token: string; person: string }>;
  awaitIoMInvite(input: { token: string; timeoutMs?: number }): Promise<{ person: string }>;
  acceptIoMInvite(input: { invitationUrl: string; timeoutMs?: number }): Promise<{ person: string }>;
} {
  const pairing = (connections as unknown as { pairing: LanePairing }).pairing;
  const pendingInvites = new Map<string, PendingPairing>();

  return {
    /**
     * Create a same-person pairing invitation on the Glue commserver.
     * Returns immediately with the shareable URL (the column's IoM QR
     * payload); pairing completes when the second device accepts. Await it
     * with awaitIoMInvite.
     */
    async createIoMInvite(): Promise<{ invitationUrl: string; token: string; person: string }> {
      const person = self();
      if (!email || !email.includes('@')) {
        throw new Error('UVC lab: IoM is not wired for this instance (owner email missing).');
      }
      const invitation = await pairing.createInvitation(person, undefined, {
        mode: 'primed',
        identityRelation: 'same-person',
        deviceEnrollmentPersonId: person,
      });
      const pending = watchPairingToken(pairing, invitation.token);
      // Keep the rejection handled while the QR is waiting to be scanned,
      // but retain the original rejected promise for awaitIoMInvite. A
      // catch-returned promise would silently turn pairing failure into
      // success for callers that await it later.
      void pending.promise.catch(() => undefined);
      pendingInvites.set(invitation.token, pending);
      try {
        const { invitationUrl } = buildUvcIoMInviteUrl({
          appBaseUrl: String(appBaseUrl ?? '').trim() || 'http://localhost/',
          email,
          person,
          token: invitation.token,
          url: invitation.url,
          publicKey: String(invitation.publicKey),
          pairingProtocolVersion: PAIRING_PROTOCOL_VERSION,
        });
        return { invitationUrl, token: invitation.token, person };
      } catch (error) {
        pendingInvites.delete(invitation.token);
        pending.cancel();
        throw error;
      }
    },

    /** Wait for the pairing started by createIoMInvite to commit. */
    async awaitIoMInvite({
      token,
      timeoutMs = 120_000,
    }: {
      token: string;
      timeoutMs?: number;
    }): Promise<{ person: string }> {
      const pending = pendingInvites.get(token);
      if (!pending) throw new Error('UVC lab: unknown IoM invitation token.');
      try {
        await withTimeout(pending.promise, timeoutMs, 'UVC lab: IoM pairing timed out waiting for the second device.');
        return { person: self() };
      } finally {
        pendingInvites.delete(token);
        pending.cancel();
      }
    },

    /**
     * Accept an IoM invitation on a device holding the invited identity
     * (registered with the exact invited email). Runs the standard
     * same-person pairing over the invitation's commserver; the token authorizes
     * this instance's additional keys. Fails fast for any other person.
     */
    async acceptIoMInvite({
      invitationUrl,
      timeoutMs = 120_000,
    }: {
      invitationUrl: string;
      timeoutMs?: number;
    }): Promise<{ person: string }> {
      const invite = decodeUvcIoMInvite(invitationUrl, PAIRING_PROTOCOL_VERSION);
      const person = self();
      if (person !== invite.deviceEnrollmentPersonId) {
        throw new Error(
          'UVC lab: this IoM invitation names a different person. ' + `Open it on a device registered as ${invite.email}.`,
        );
      }
      // The `mode` marker is URL-level metadata; the pairing handshake only
      // takes the invitation itself, primed like the canonical IoM accept.
      await withTimeout(
        pairing.connectUsingInvitation(
          {
            token: invite.token,
            url: invite.url,
            publicKey: invite.publicKey,
            pairingProtocolVersion: invite.pairingProtocolVersion,
            pairingMode: invite.pairingMode,
            identityRelation: invite.identityRelation,
            deviceEnrollmentPersonId: invite.deviceEnrollmentPersonId,
          },
          person,
          { mode: 'primed' },
        ),
        timeoutMs,
        'UVC lab: IoM pairing timed out.',
      );
      return { person };
    },
  };
}

export type IoMOps = ReturnType<typeof createIoMOps>;
