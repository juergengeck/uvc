import { AppModel } from '../models/AppModel';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type DeviceModel from '../models/device/DeviceModel';

let modelInstance: AppModel | undefined;

/**
 * Service for accessing global model instances
 * This breaks circular dependencies by providing a central access point
 */
export class ModelService {
  /**
   * Set the global model instance
   */
  static setModel(model: AppModel) {
    modelInstance = model;
  }

  /**
   * Clear the global model instance
   */
  static clearModel() {
    modelInstance = undefined;
  }

  /**
   * Get the global model instance
   */
  static getModel(): AppModel | undefined {
    return modelInstance;
  }

  /**
   * Get the LeuteModel instance
   */
  static getLeuteModel(): LeuteModel | undefined {
    return modelInstance?.leuteModel;
  }

  /**
   * Get the TopicModel instance
   */
  static getTopicModel(): TopicModel | undefined {
    return modelInstance?.topicModel;
  }

  /**
   * Get the ChannelManager instance
   */
  static getChannelManager(): ChannelManager | undefined {
    return modelInstance?.channelManager;
  }

  /**
   * Get the DeviceModel instance
   */
  static getDeviceModel(): DeviceModel | undefined {
    return modelInstance?.deviceModel;
  }

  /**
   * Get the AppModel instance (alias for getModel)
   */
  static getAppModel(): AppModel | undefined {
    return modelInstance;
  }
} 