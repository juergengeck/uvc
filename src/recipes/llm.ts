import type { Recipe, RecipeRule } from '@refinio/one.core/lib/recipes.js'
import type { LLM } from '@OneObjectInterfaces'

/**
 * Recipe for Large Language Models (LLMs)
 * Handles model metadata and filesystem references
 * 
 * NOTE: This recipe uses the LLM interface from @OneObjectInterfaces.d.ts,
 * which is the canonical definition for LLM objects in the application.
 * 
 * IMPORTANT: The modelPath property has been removed from this recipe and LLM objects.
 * Path information is now stored only in the LLMSettings wrapper object, providing
 * better separation between persistent data and runtime configuration.
 * 
 * This follows the pattern described in one.core README.md where each property
 * in the interface must have a corresponding entry in the recipe's rule array.
 * 
 * The recipe rules define the validation and serialization behavior for LLM objects,
 * ensuring they can be properly stored in and retrieved from the ONE data system.
 */
export const LLMRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'LLM',
    rule: [
        {
            itemprop: '$type$',
            itemtype: { type: 'string', regexp: /^LLM$/ }
        },
        {
            itemprop: 'name',
            itemtype: { type: 'string' },
            isId: true
        },
        {
            itemprop: 'filename',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'modelType',
            itemtype: { 
                type: 'string',
                // Define allowed values without using enum
                regexp: /^(local|remote)$/
            }
        },
        {
            itemprop: 'active',
            itemtype: { type: 'boolean' }
        },
        {
            itemprop: 'deleted',
            itemtype: { type: 'boolean' }
        },
        {
            itemprop: 'creator',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'created',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'modified',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'createdAt',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'lastUsed',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'lastInitialized',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'usageCount',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'size',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'personId',
            itemtype: { 
                type: 'referenceToId', 
                allowedTypes: new Set(['Person']) 
            },
            optional: true
        },
        {
            itemprop: 'capabilities',
            itemtype: { 
                type: 'array', 
                item: { 
                    type: 'string',
                    // Define allowed values without using enum 
                    regexp: /^(chat|inference)$/
                } 
            },
            optional: true
        },

        // Model parameters
        {
            itemprop: 'temperature',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'maxTokens',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'contextSize',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'batchSize',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'threads',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'mirostat',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'topK',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'topP',
            itemtype: { type: 'number' },
            optional: true
        },

        // Optional properties
        {
            itemprop: 'architecture',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'contextLength',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'quantization',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'checksum',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'provider',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'downloadUrl',
            itemtype: { type: 'string' },
            optional: true
        }
    ]
};

// Export recipes as array to match one.models pattern
export default [LLMRecipe]; 