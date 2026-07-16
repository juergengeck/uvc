import {
  type UvcAdminRoleGrantResult,
  type UvcDeviceIdentityCertificateResult,
  type UvcHeadlessProvisioningDevice,
  type UvcIdentityAssignmentResult,
} from '@refinio/uvc.core';

import {
  decodeGroovAuthorityFrame,
  encodeGroovAuthorityFrame,
  GROOV_PROVISIONING_STREAM_ID,
  GroovAuthorityFrameType,
  type JsonRecord,
} from './protocol.js';
import type {QuicVCStreamHost, QuicVCStreamServiceMessage} from './types.js';

export interface GroovVerifiedProvisioningPeer {
  personId: string;
  instanceId: string;
  publicKey: string;
  publicSignKey: string;
  signAlgorithm: 'ed25519' | 'ecdsa-p256-sha256';
}

export interface GroovProvisioningServiceOptions {
  onPeerVerified?: (peer: GroovVerifiedProvisioningPeer) => void;
  onProvisioned?: (grant: UvcAdminRoleGrantResult) => void | Promise<void>;
}

/** Device-side QUICVC adapter for UvcHeadlessProvisioningDevice. */
export class GroovProvisioningService {
  private unregisterHandler: (() => void) | null = null;
  private readonly ceremonies = new Map<string, {connectionId: string; peerPersonId: string}>();

  constructor(
    private readonly quicManager: QuicVCStreamHost,
    private readonly device: UvcHeadlessProvisioningDevice,
    private readonly options: GroovProvisioningServiceOptions = {},
  ) {}

  start(): void {
    if (this.unregisterHandler) {
      return;
    }
    this.unregisterHandler = this.quicManager.registerStreamServiceHandler(
      GROOV_PROVISIONING_STREAM_ID,
      message => this.handleMessage(message),
    );
  }

  stop(): void {
    this.unregisterHandler?.();
    this.unregisterHandler = null;
    this.ceremonies.clear();
  }

  private async handleMessage(message: QuicVCStreamServiceMessage): Promise<void> {
    let requestId = 'provisioning';
    try {
      const peer = verifiedPeer(message);
      this.options.onPeerVerified?.(peer);
      const frame = decodeGroovAuthorityFrame(message.payload);
      requestId = frame.requestId;
      if (frame.frameType === GroovAuthorityFrameType.IdentityAssignmentRequest) {
        const input = parseAssignmentResult(frame.payload);
        const proof = await this.device.acceptAssignment(input, peer as never);
        this.ceremonies.set(input.assignment.ceremonyId, {
          connectionId: message.connectionId,
          peerPersonId: peer.personId,
        });
        await this.send(message, GroovAuthorityFrameType.DeviceIdentityProofResponse, requestId, proof as unknown as JsonRecord);
        return;
      }
      if (frame.frameType === GroovAuthorityFrameType.IdentityCertificateRequest) {
        const input = parseCertificateResult(frame.payload);
        const ceremony = this.ceremonies.get(input.certificate.ceremonyId);
        if (!ceremony || ceremony.connectionId !== message.connectionId || ceremony.peerPersonId !== peer.personId) {
          throw new Error('certificate arrived outside its authenticated provisioning connection');
        }
        const grant = await this.device.acceptCertificate(input);
        this.ceremonies.delete(input.certificate.ceremonyId);
        const result = grant as unknown as UvcAdminRoleGrantResult;
        await this.send(message, GroovAuthorityFrameType.AdminRoleGrantResponse, requestId, result as unknown as JsonRecord);
        await this.options.onProvisioned?.(result);
        return;
      }
      throw new Error(`frame type ${frame.frameType} is not a provisioning request`);
    } catch (error) {
      await this.send(message, GroovAuthorityFrameType.ErrorResponse, requestId, {
        code: 'provisioning_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async send(
    message: QuicVCStreamServiceMessage,
    type: GroovAuthorityFrameType,
    requestId: string,
    payload: JsonRecord,
  ): Promise<void> {
    await this.quicManager.sendStreamData(
      message.deviceId,
      GROOV_PROVISIONING_STREAM_ID,
      encodeGroovAuthorityFrame(type, requestId, payload),
      message.connectionId,
    );
  }
}

function verifiedPeer(message: QuicVCStreamServiceMessage): GroovVerifiedProvisioningPeer {
  if (message.connection.state !== 'established') {
    throw new Error('QUICVC connection is not established');
  }
  const personId = message.connection.peerPersonId?.trim();
  const instanceId = message.connection.peerInstanceId?.trim();
  const publicKey = message.connection.peerPublicKey?.trim();
  const publicSignKey = message.connection.peerPublicSignKey?.trim();
  const signAlgorithm = message.connection.peerSignAlgorithm;
  if (!personId || !instanceId || !publicKey || !publicSignKey || !signAlgorithm) {
    throw new Error('QUICVC peer Person, Instance, encryption key, signing key, and algorithm are required for provisioning');
  }
  return {personId, instanceId, publicKey, publicSignKey, signAlgorithm};
}

function parseAssignmentResult(payload: JsonRecord): UvcIdentityAssignmentResult {
  const input = payload as unknown as Partial<UvcIdentityAssignmentResult>;
  if (typeof input.assignmentHash !== 'string' || input.assignment?.$type$ !== 'UvcIdentityAssignment') {
    throw new Error('identity assignment payload is invalid');
  }
  return input as UvcIdentityAssignmentResult;
}

function parseCertificateResult(payload: JsonRecord): UvcDeviceIdentityCertificateResult {
  const input = payload as unknown as Partial<UvcDeviceIdentityCertificateResult>;
  if (typeof input.certificateHash !== 'string' || input.certificate?.$type$ !== 'UvcDeviceIdentityCertificate') {
    throw new Error('identity certificate payload is invalid');
  }
  return input as UvcDeviceIdentityCertificateResult;
}
