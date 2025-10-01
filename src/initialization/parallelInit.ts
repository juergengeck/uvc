/**
 * Parallel Initialization Module
 *
 * Optimizes initialization by running independent operations in parallel
 */

import { measureTime } from '../utils/performanceOptimization';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { TransportManager } from '../models/network/TransportManager';
import { createChannelManager, initializeChannelManager } from './channelManagerSingleton';
import LeuteAccessRightsManager from '../models/LeuteAccessRightsManager';
import { initializePlatform } from '../platform/init';
import { AppModel } from '../models/AppModel';
import { performanceSummary } from '../utils/performanceSummary';

/**
 * Initialize core models in parallel where possible
 */
export async function parallelInitializeCore(
  commServerUrl: string,
  authenticator: any
): Promise<{
  leuteModel: InstanceType<typeof LeuteModel>;
  channelManager: any;
  transportManager: TransportManager;
  leuteAccessRightsManager: any;
  groups: { [key: string]: string };
}> {
  const parallelStartTime = Date.now();

  // Step 1: Initialize LeuteModel first (required by others)
  const leuteModel = await measureTime('LeuteModel.init', async () => {
    const model = new LeuteModel(commServerUrl, true);
    await model.init();
    return model;
  });

  // Step 2: Initialize ChannelManager and Groups in parallel
  // These don't depend on each other
  const [channelManager, groupResults] = await Promise.all([
    measureTime('ChannelManager init', async () => {
      const manager = createChannelManager(leuteModel);
      await initializeChannelManager();
      return manager;
    }),
    measureTime('Group creation (parallel)', async () => {
      const getGroupIdByName = async (name: string) => {
        const group = await leuteModel.createGroup(name);
        return group.groupIdHash;
      };

      const [iom, leuteReplicant, glueReplicant, everyone] = await Promise.all([
        getGroupIdByName('iom'),
        getGroupIdByName('leute-replicant'),
        getGroupIdByName('glue-replicant'),
        getGroupIdByName('everyone')
      ]);

      return { iom, leuteReplicant, glueReplicant, everyone };
    })
  ]);

  // Step 3: Initialize TransportManager and LeuteAccessRightsManager in parallel
  // TransportManager depends on channelManager
  // LeuteAccessRightsManager depends on channelManager and groups
  const [transportManager, leuteAccessRightsManager] = await Promise.all([
    measureTime('TransportManager.init', async () => {
      const manager = new TransportManager(leuteModel, channelManager, commServerUrl);
      await manager.init();
      return manager;
    }),
    measureTime('LeuteAccessRightsManager.init', async () => {
      const manager = new LeuteAccessRightsManager(
        channelManager,
        null, // Will set connections model later
        leuteModel
      );
      await manager.init(groupResults);
      return manager;
    })
  ]);

  // Fix the connections model reference
  leuteAccessRightsManager.connectionsModel = transportManager.getConnectionsModel();

  console.log(`[PERF] Parallel core initialization: ${Date.now() - parallelStartTime}ms`);
  performanceSummary.record('Parallel core init', Date.now() - parallelStartTime);

  return {
    leuteModel,
    channelManager,
    transportManager,
    leuteAccessRightsManager,
    groups: groupResults
  };
}

/**
 * Initialize platform services and start networking in parallel
 */
export async function parallelInitializePlatformAndNetwork(
  transportManager: TransportManager
): Promise<void> {
  const startTime = Date.now();

  await Promise.all([
    measureTime('initializePlatform', () => initializePlatform()),
    measureTime('startNetworking', () =>
      transportManager.startNetworking().catch(err => {
        console.error('[initModel] ❌ Failed to start networking layer:', err);
        // Non-fatal - user can still use local features
      })
    )
  ]);

  console.log(`[PERF] Platform & network parallel init: ${Date.now() - startTime}ms`);
  performanceSummary.record('Platform & network init', Date.now() - startTime);
}

/**
 * Create AppModel with optimized initialization
 */
export async function createOptimizedAppModel(
  leuteModel: any,
  channelManager: any,
  transportManager: TransportManager,
  authenticator: any,
  leuteAccessRightsManager: any
): Promise<AppModel> {
  const startTime = Date.now();

  const appModel = new AppModel({
    leuteModel,
    channelManager,
    transportManager,
    authenticator,
    leuteAccessRightsManager,
    llmManager: undefined
  });

  await appModel.init();

  console.log(`[PERF] AppModel creation: ${Date.now() - startTime}ms`);
  performanceSummary.record('AppModel creation', Date.now() - startTime);

  return appModel;
}