import type { Recipe, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js'
import type { GlobalLLMSettings } from '../models/ai/LLMSettingsManager'

/**
 * Recipe for Global LLM Settings
 * 
 * A simplified recipe for global LLM settings without complex validation rules.
 * This avoids the issues with the previous AIModelSettings recipe.
 */
export const GlobalLLMSettingsRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'GlobalLLMSettings' as OneObjectTypeNames,
    rule: [
        {
            itemprop: '$type$',
            itemtype: { type: 'string', regexp: /^GlobalLLMSettings$/ }
        },
        {
            itemprop: 'creator',
            itemtype: { type: 'string' },
            isId: true
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
            itemprop: 'defaultModelId',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'temperature',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'maxTokens',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'enableAutoSummary',
            itemtype: { type: 'boolean' }
        },
        {
            itemprop: 'enableAutoResponse',
            itemtype: { type: 'boolean' }
        },
        {
            itemprop: 'defaultPrompt',
            itemtype: { type: 'string' }
        },
        {
            itemprop: '$versionHash$',
            itemtype: { type: 'string' },
            optional: true
        }
    ]
};

// Export recipes as array to match one.models pattern
export default [GlobalLLMSettingsRecipe]; 