/**
 * AI Contact Manager
 * 
 * Handles creating and managing contacts for AI/LLM models.
 * This ensures AI models appear as contacts in the contact list and can be used in conversations.
 */

import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { LLM } from '../../../types/llm';
import { createContact } from '../../../utils/contactUtils';

export class AIContactManager {
  private leuteModel: InstanceType<typeof LeuteModel>;
  
  constructor(leuteModel: InstanceType<typeof LeuteModel>) {
    this.leuteModel = leuteModel;
  }

  /**
   * Ensure contacts exist for all provided LLM models
   * @param models Array of LLM models to create contacts for
   * @returns Number of contacts created/verified
   */
  async ensureContactsForModels(models: LLM[]): Promise<number> {
    if (!this.leuteModel) {
      console.warn('[AIContactManager] No leuteModel available for contact creation');
      return 0;
    }

    if (!models || models.length === 0) {
      console.log('[AIContactManager] No models provided, skipping contact creation');
      return 0;
    }

    console.log(`[AIContactManager] Ensuring contacts for ${models.length} LLM models`);
    let contactsCreated = 0;

    for (const model of models) {
      try {
        if (!model.name) {
          console.warn('[AIContactManager] Skipping model with no name:', model);
          continue;
        }

        // Create AI-style email for the model
        const modelEmail = `${model.name}@ai.local`;
        console.log(`[AIContactManager] Creating contact for model: ${model.name} (${modelEmail})`);

        // Create contact using the existing utility
        const contact = await createContact(
          modelEmail,
          this.leuteModel,
          {
            displayName: model.name,
            isAI: true
          }
        );

        if (contact) {
          console.log(`[AIContactManager] ✅ Contact created for ${model.name}`);
          contactsCreated++;
        } else {
          console.warn(`[AIContactManager] ❌ Failed to create contact for ${model.name}`);
        }
      } catch (error) {
        console.error(`[AIContactManager] Error creating contact for model ${model.name}:`, error);
      }
    }

    console.log(`[AIContactManager] Contact creation complete: ${contactsCreated}/${models.length} contacts created`);
    return contactsCreated;
  }

  /**
   * Create a contact for a single LLM model
   * @param model The LLM model to create a contact for
   * @returns The created contact or null if failed
   */
  async createContactForModel(model: LLM): Promise<any> {
    if (!this.leuteModel) {
      console.warn('[AIContactManager] No leuteModel available for contact creation');
      return null;
    }

    if (!model.name) {
      console.warn('[AIContactManager] Cannot create contact for model without name:', model);
      return null;
    }

    try {
      const modelEmail = `${model.name}@ai.local`;
      console.log(`[AIContactManager] Creating contact for model: ${model.name}`);

      const contact = await createContact(
        modelEmail,
        this.leuteModel,
        {
          displayName: model.name,
          isAI: true
        }
      );

      if (contact) {
        console.log(`[AIContactManager] ✅ Contact created for ${model.name}`);
      }

      return contact;
    } catch (error) {
      console.error(`[AIContactManager] Error creating contact for model ${model.name}:`, error);
      return null;
    }
  }
} 