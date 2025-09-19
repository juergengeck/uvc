import { Model } from '@refinio/one.models/lib/models/Model.js';
import { AIAssistantModel } from '../models/ai/assistant/AIAssistantModel';
import type { LLM } from './llm';

declare module '@refinio/one.models/lib/models/Model.js' {
  interface Model {
    aiModel?: AIAssistantModel;
  }
}

// Extend LLM type to include contact-related properties
declare module '@refinio/one.models/lib/models/LLM.js' {
  // Reference the canonical LLM type and only add the additional properties
  interface LLM {
    contactId?: string;
    hasContact?: boolean;
  }
} 