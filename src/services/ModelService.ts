import { AppModel } from '../models/AppModel';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type DeviceModel from '../models/device/DeviceModel';
import { appRuntimeState } from '../initialization/runtimeState';

/**
 * Service for accessing global model instances
 * This breaks circular dependencies by providing a central access point
 */
export class ModelService {
  /**
   * Set the global model instance
   */
  static setModel(model: AppModel) {
    appRuntimeState.model = model;
  }

  /**
   * Clear the global model instance
   */
  static clearModel() {
    appRuntimeState.model = undefined;
  }

  /**
   * Get the global model instance
   */
  static getModel(): AppModel | undefined {
    return appRuntimeState.model;
  }

  /**
   * Get the LeuteModel instance
   */
  static getLeuteModel(): LeuteModel | undefined {
    return appRuntimeState.model?.leuteModel;
  }

  /**
   * Get the TopicModel instance
   */
  static getTopicModel(): TopicModel | undefined {
    return appRuntimeState.model?.topicModel;
  }

  /**
   * Get the ChannelManager instance
   */
  static getChannelManager(): ChannelManager | undefined {
    return appRuntimeState.model?.channelManager;
  }

  /**
   * Get the DeviceModel instance
   */
  static getDeviceModel(): DeviceModel | undefined {
    return appRuntimeState.model?.deviceModel;
  }

  /**
   * Get the AppModel instance (alias for getModel)
   */
  static getAppModel(): AppModel | undefined {
    return appRuntimeState.model;
  }
}
