/**
 * IoM (self-device) invitations for the UVC lab lane.
 *
 * A lane role's Person id derives from its email, so a second device that
 * registers with the exact same email reproduces the exact same Person id
 * with fresh instance keys. A same-person pairing invitation then authorizes
 * the new instance keys under a one-time token, and the stack reports the
 * link as Internet of Me. Pairing never transfers identity; the invite only
 * introduces the two instances over a rendezvous relay neither side could
 * dial directly (workers and phones cannot listen).
 *
 * Realm-only module: it drives WebSocket rendezvous rooms and the pairing
 * manager, so it loads inside the worker realm next to laneInstance, never
 * in jest. URL validation itself is the pure iomInvite codec, tested there.
 */

import { createWebSocket } from '@refinio/one.core/lib/system/websocket.js';
import Connection from '@refinio/one.models/lib/misc/Connection/Connection.js';
import WebSocketPlugin from '@refinio/one.models/lib/misc/Connection/plugins/WebSocketPlugin.js';
import PromisePlugin from '@refinio/one.models/lib/misc/Connection/plugins/PromisePlugin.js';
import { PAIRING_PROTOCOL_VERSION } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import { buildUvcIoMInviteUrl, decodeUvcIoMInvite, relayRoomUrl } from './iomInvite.ts';

interface LanePairing {
  createInvitation(
    myPersonId?: string,
    token?: string,
    options?: { mode?: string; identityRelation?: string; deviceEnrollmentPersonId?: string },
  ): Promise<{ token: string; publicKey: string }>;
  connectUsingInvitation(
    invitation: Record<string, unknown>,
    myPersonId?: string,
    options?: { mode?: string },
  ): Promise<void>;
}

export interface IoMDeps {
  connections: ConnectionsModel;
  /** Instance owner Person id hash. */
  self(): string;
  /** Listener id carrying the registered pairing credential. */
  listenerUrl: string;
  /** Instance owner email; IoM invitations name it as the identity hint. */
  email: string;
}

interface PendingInvite {
  socket: { close(): void };
  paired: Promise<void>;
}

const pendingInvites = new Map<string, PendingInvite>();

function unref(timer: unknown): void {
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

function waitOpen(socket: WebSocket, url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (finish: () => void): void => {
      clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      finish();
    };
    const timer = setTimeout(() => {
      socket.close();
      done(() => reject(new Error(`UVC lab: rendezvous unreachable (${url}).`)));
    }, timeoutMs);
    unref(timer);
    const onOpen = (): void => done(resolve);
    const onError = (): void => done(() => reject(new Error(`UVC lab: rendezvous unreachable (${url}).`)));
    socket.addEventListener('open', onOpen);
    socket.addEventListener('error', onError);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    unref(timer);
  });
  return Promise.race([
    promise.then(value => {
      clearTimeout(timer);
      return value;
    }),
    timeout,
  ]);
}

export function createIoMOps({ connections, self, listenerUrl, email }: IoMDeps): {
  createIoMInvite(input: {
    relayUrl: string;
    openTimeoutMs?: number;
  }): Promise<{ invitationUrl: string; token: string; person: string }>;
  awaitIoMInvite(input: { token: string; timeoutMs?: number }): Promise<{ person: string }>;
  acceptIoMInvite(input: { invitationUrl: string; timeoutMs?: number }): Promise<{ person: string }>;
} {
  const pairing = (connections as unknown as { pairing: LanePairing }).pairing;

  return {
    /**
     * Create a same-person pairing invitation and host its rendezvous room.
     * Returns immediately with the shareable URL (the column's IoM QR
     * payload); pairing completes when the second device accepts. Await it
     * with awaitIoMInvite.
     */
    async createIoMInvite({
      relayUrl,
      openTimeoutMs = 15_000,
    }: {
      relayUrl: string;
      openTimeoutMs?: number;
    }): Promise<{ invitationUrl: string; token: string; person: string }> {
      const person = self();
      if (!email || !email.includes('@')) {
        throw new Error('UVC lab: IoM is not wired for this instance (owner email missing).');
      }
      const relay = String(relayUrl ?? '').trim();
      const invitation = await pairing.createInvitation(person, undefined, {
        mode: 'primed',
        identityRelation: 'same-person',
        deviceEnrollmentPersonId: person,
      });
      const socket = createWebSocket(relayRoomUrl(relay, invitation.token, 'host'));
      await waitOpen(socket, relay, openTimeoutMs);
      // The outgoing side gains its PromisePlugin in connectWithEncryption;
      // the accepted side needs it added explicitly.
      const incoming = Connection.fromPlugin(new WebSocketPlugin(socket));
      incoming.addPlugin(new PromisePlugin());
      const paired = connections.acceptExternalConnection(incoming, listenerUrl).then(() => undefined);
      // Never float: awaitIoMInvite observes this promise; the catch only
      // records so an unobserved failure cannot crash the worker.
      const observed = paired.catch(() => undefined);
      pendingInvites.set(invitation.token, { socket, paired: observed });
      const { invitationUrl } = buildUvcIoMInviteUrl({
        relayUrl: relay,
        email,
        person,
        token: invitation.token,
        publicKey: String(invitation.publicKey),
        pairingProtocolVersion: PAIRING_PROTOCOL_VERSION,
      });
      return { invitationUrl, token: invitation.token, person };
    },

    /** Wait for the pairing started by createIoMInvite (socket stays open). */
    async awaitIoMInvite({
      token,
      timeoutMs = 120_000,
    }: {
      token: string;
      timeoutMs?: number;
    }): Promise<{ person: string }> {
      const pending = pendingInvites.get(token);
      if (!pending) throw new Error('UVC lab: unknown IoM invitation token.');
      await withTimeout(pending.paired, timeoutMs, 'UVC lab: IoM pairing timed out waiting for the second device.');
      pendingInvites.delete(token);
      return { person: self() };
    },

    /**
     * Accept an IoM invitation on a device holding the invited identity
     * (registered with the exact invited email). Runs the standard
     * same-person pairing over the rendezvous room; the token authorizes
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
