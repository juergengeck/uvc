import {
  type UvcAdminRoleGrantResult,
  type UvcDeviceIdentityCertificateResult,
  type UvcDeviceIdentityProofResult,
  type UvcIdentityAssignmentResult,
  type UvcProvisioningController,
} from '@refinio/uvc.core';

import {
  decodeGroovAuthorityFrame,
  encodeGroovAuthorityFrame,
  GROOV_PROVISIONING_STREAM_ID,
  GroovAuthorityFrameType,
} from './protocol.js';
import type {QuicVCStreamHost, QuicVCStreamServiceMessage} from './types.js';

interface PendingProvisioning {
  deviceId: string;
  connectionId?: string;
  assignment: UvcIdentityAssignmentResult;
  certificate?: UvcDeviceIdentityCertificateResult;
  resolve: (grant: UvcAdminRoleGrantResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Controller-side transport adapter. The cryptographic state remains in uvc.core. */
export class QuicVCHeadlessProvisioningClient {
  private unregisterHandler: (() => void) | null = null;
  private readonly pending = new Map<string, PendingProvisioning>();
  private sequence = 0;

  constructor(
    private readonly quicManager: QuicVCStreamHost,
    private readonly controller: UvcProvisioningController,
    private readonly timeoutMs = 20_000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Groov provisioning timeout must be a positive integer');
    }
  }

  async provision(input: {
    deviceId: string;
    connectionId?: string;
    hardwareDeviceId: string;
    deviceKind: 'groov' | 'esp32';
    assignedEmail: string;
    assignedInstanceName: string;
  }): Promise<UvcAdminRoleGrantResult> {
    this.start();
    const requestId = `groov-provision:${Date.now()}:${++this.sequence}`;
    const assignment = await this.controller.createAssignment({
      hardwareDeviceId: input.hardwareDeviceId,
      deviceKind: input.deviceKind,
      assignedEmail: input.assignedEmail,
      assignedInstanceName: input.assignedInstanceName,
    });
    const response = new Promise<UvcAdminRoleGrantResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Groov provisioning ${requestId} timed out`));
      }, this.timeoutMs);
      this.pending.set(requestId, {
        deviceId: input.deviceId,
        ...(input.connectionId ? {connectionId: input.connectionId} : {}),
        assignment,
        resolve,
        reject,
        timeout,
      });
    });
    try {
      await this.quicManager.sendStreamData(
        input.deviceId,
        GROOV_PROVISIONING_STREAM_ID,
        encodeGroovAuthorityFrame(
          GroovAuthorityFrameType.IdentityAssignmentRequest,
          requestId,
          assignment as unknown as Record<string, unknown>,
        ),
        input.connectionId,
      );
    } catch (error) {
      this.fail(requestId, error);
    }
    return response;
  }

  stop(): void {
    this.unregisterHandler?.();
    this.unregisterHandler = null;
    for (const requestId of this.pending.keys()) {
      this.fail(requestId, new Error('Groov provisioning client stopped'));
    }
  }

  private start(): void {
    if (!this.unregisterHandler) {
      this.unregisterHandler = this.quicManager.registerStreamServiceHandler(
        GROOV_PROVISIONING_STREAM_ID,
        message => this.handleMessage(message),
      );
    }
  }

  private async handleMessage(message: QuicVCStreamServiceMessage): Promise<void> {
    let frame;
    try {
      frame = decodeGroovAuthorityFrame(message.payload);
    } catch {
      return;
    }
    const pending = this.pending.get(frame.requestId);
    if (
      !pending
      || pending.deviceId !== message.deviceId
      || (pending.connectionId && pending.connectionId !== message.connectionId)
    ) {
      return;
    }
    try {
      if (frame.frameType === GroovAuthorityFrameType.ErrorResponse) {
        throw new Error(String(frame.payload.message ?? 'Groov provisioning failed'));
      }
      if (frame.frameType === GroovAuthorityFrameType.DeviceIdentityProofResponse && !pending.certificate) {
        const proof = frame.payload as unknown as UvcDeviceIdentityProofResult;
        if (proof.proof?.$type$ !== 'UvcDeviceIdentityProof' || typeof proof.proofHash !== 'string') {
          throw new Error('Groov returned an invalid device identity proof');
        }
        pending.certificate = await this.controller.certify({...pending.assignment, ...proof});
        await this.quicManager.sendStreamData(
          pending.deviceId,
          GROOV_PROVISIONING_STREAM_ID,
          encodeGroovAuthorityFrame(
            GroovAuthorityFrameType.IdentityCertificateRequest,
            frame.requestId,
            pending.certificate as unknown as Record<string, unknown>,
          ),
          pending.connectionId,
        );
        return;
      }
      if (frame.frameType === GroovAuthorityFrameType.AdminRoleGrantResponse && pending.certificate) {
        const grant = frame.payload as unknown as UvcAdminRoleGrantResult;
        if (grant.grant?.$type$ !== 'UvcAdminRoleGrant' || typeof grant.grantHash !== 'string') {
          throw new Error('Groov returned an invalid admin grant');
        }
        await this.controller.acceptAdminGrant({...pending.certificate, ...grant});
        clearTimeout(pending.timeout);
        this.pending.delete(frame.requestId);
        pending.resolve(grant);
        return;
      }
      throw new Error(`unexpected Groov provisioning response ${frame.frameType}`);
    } catch (error) {
      this.fail(frame.requestId, error);
    }
  }

  private fail(requestId: string, error: unknown): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(requestId);
    pending.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export class GroovProvisioningClient extends QuicVCHeadlessProvisioningClient {
  provision(input: {
    deviceId: string;
    connectionId?: string;
    hardwareDeviceId: string;
    assignedEmail: string;
    assignedInstanceName: string;
  }): Promise<UvcAdminRoleGrantResult> {
    return super.provision({...input, deviceKind: 'groov'});
  }
}
