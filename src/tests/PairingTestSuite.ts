import type { ITestSuite, ITestCase } from './types';
import { registerTestSuite } from './TestRegistry';
import { InviteManager } from '@src/models/contacts/InviteManager';
import { getAppModelInstance } from '@src/models/AppModel';

class PairingTestSuite implements ITestSuite {
  getTestCases(): ITestCase[] {
    return [
      {
        name: 'Create Invitation',
        description: 'Test creating a pairing invitation',
        category: 'pairing',
        run: this.testCreateInvitation,
      },
      {
        name: 'Check for LeuteConnectionsModule',
        description: 'Test if the LeuteConnectionsModule is correctly attached to the ConnectionsModel',
        category: 'pairing',
        run: this.testLeuteConnectionsModulePresence,
      },
    ];
  }

  private async testCreateInvitation(): Promise<void> {
    const appModel = getAppModelInstance();
    if (!appModel) {
      throw new Error('AppModel not available');
    }

    const inviteManager = appModel.inviteManager;
    if (!inviteManager) {
      throw new Error('InviteManager not available');
    }

    const invitationUrl = await inviteManager.generateInvitationUrl();

    if (!invitationUrl) {
      throw new Error('Failed to create invitation URL');
    }

    if (typeof invitationUrl !== 'string' || !invitationUrl.startsWith('https://')) {
        throw new Error(`Generated invitation is not a valid URL: ${invitationUrl}`);
    }
  }

  private async testLeuteConnectionsModulePresence(): Promise<void> {
    const appModel = getAppModelInstance();
    if (!appModel) {
      throw new Error('AppModel not available');
    }

    const connectionsModel = appModel.getConnectionsModel();
    if (!connectionsModel) {
        throw new Error('ConnectionsModel not available');
    }

    if (!connectionsModel.leuteConnectionsModule) {
        throw new Error('LeuteConnectionsModule is not attached to ConnectionsModel. The fix was not applied correctly.');
    }

    if (typeof connectionsModel.leuteConnectionsModule.onUnknownConnection?.listen !== 'function') {
        throw new Error('leuteConnectionsModule.onUnknownConnection is not available. The catch-all routes are likely missing.');
    }
  }
}

const pairingTestSuite = new PairingTestSuite();
registerTestSuite(pairingTestSuite);
