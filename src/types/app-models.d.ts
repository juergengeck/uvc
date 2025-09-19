/**
 * Type declarations for AppModel and related models
 * This provides proper TypeScript typing for the models used in the application
 */

import type { Model } from '@refinio/one.models/lib/models/Model.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type { LLMManager } from '@src/models/ai/LLMManager';
import type AIAssistantModel from '@src/models/ai/assistant/AIAssistantModel';
import type JournalModel from '@refinio/one.models/lib/models/JournalModel.js';
import type QuestionnaireModel from '@refinio/one.models/lib/models/QuestionnaireModel.js';
import type { StateMachine } from '@refinio/one.models/lib/misc/StateMachine.js';
import type { DeviceDiscoveryModel } from '@src/models/network/DeviceDiscoveryModel';
import type { QuicModel } from '@src/models/network/QuicModel';

/**
 * Extended Model interface that includes all properties available on the AppModel
 */
declare module '@refinio/one.models/lib/models/Model.js' {
  interface Model {
    // Core models
    leuteModel: LeuteModel;
    channelManager: ChannelManager;
    topicModel: TopicModel;
    questionnaireModel: QuestionnaireModel;
    journalModel: JournalModel;
    
    // AI/LLM models
    llmManager: LLMManager;
    aiAssistantModel?: AIAssistantModel;
    
    // Network models
    quicModel: QuicModel;
    deviceDiscoveryModel?: DeviceDiscoveryModel;
    
    // State and metadata
    state: StateMachine<"Uninitialised" | "Initialised", "shutdown" | "init">;
    
    // Methods
    shutdown(): Promise<void>;
    init(): Promise<boolean>;
  }
}

/**
 * Type declarations for missing modules
 */

// Declare module for @refinio/one.models/lib/models/App.js
declare module '@refinio/one.models/lib/models/App.js' {
  import { LLMManager } from '../../../models/ai/LLMManager';
  import { OEvent } from '@refinio/one.models/lib/misc/OEvent';
  
  export interface AppModel {
    llmManager: LLMManager;
    getModelManager: () => LLMManager;
    aiAssistantModel: any;
    getAIAssistantModel: () => any;
    aiModel?: {
      getAvailableModels?: () => Promise<Array<any>>;
    };
    onModelManagerReady?: { 
      listen: (callback: () => void) => () => void 
    };
  }
}

// Import the canonical LLM type
import type { LLM } from './llm';

// Declare module for @refinio/one.models/lib/models/LLM.js
declare module '@refinio/one.models/lib/models/LLM.js' {
  // Extend the canonical LLM interface with additional properties
  // for compatibility with the library
  interface LLM {
    // Extended properties
    contactId?: string;
    hasContact?: boolean;
  }
}

// Declare for BaseModel
declare interface BaseModel {
  llmManager: any;
  getModelManager: () => any;
  aiAssistantModel: any;
  getAIAssistantModel: () => any;
}

// React-icons declaration
declare module 'react-icons/md' {
  export const MdAdd: React.ComponentType<any>;
  export const MdDelete: React.ComponentType<any>;
  export const MdError: React.ComponentType<any>;
}

// Card component declaration
declare module '../Card' {
  import React from 'react';
  const Card: React.FC<any>;
  export default Card;
}

// AddModelModal component declaration
declare module './AddModelModal' {
  import React from 'react';
  const AddModelModal: React.FC<any>;
  export default AddModelModal;
}

// AppContext module declaration
declare module '../../contexts/AppContext' {
  import React from 'react';
  export const useAppContext: () => any;
} 