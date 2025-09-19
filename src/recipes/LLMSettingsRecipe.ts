import type { Recipe } from '@refinio/one.core/lib/recipes.js'

// Add interface declaration to register the type with one.core
declare module '@OneObjectInterfaces' {
    interface OneVersionedObjectInterfaces {
        LLMSettingsRecipe: any;
    }
}

/**
 * Recipe for LLM Settings
 * 
 * This recipe defines a versioned ONE object for LLM settings,
 * creating an audit trail of model settings for compliance and
 * troubleshooting purposes.
 */
export const LLMSettingsRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'LLMSettings',
    rule: [
        {
            itemprop: '$type$',
            itemtype: { type: 'string', regexp: /^LLMSettings$/ }
        },
        {
            itemprop: 'name',
            itemtype: { type: 'string' },
            isId: true
        },
        {
            itemprop: 'creator',
            itemtype: { type: 'string' }
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
            itemprop: 'llm',
            itemtype: { type: 'referenceToId', allowedTypes: new Set(['LLM']) }
        },
        {
            itemprop: 'isLoaded',
            itemtype: { type: 'boolean' }
        },
        // Active state
        {
            itemprop: 'active',
            itemtype: { type: 'boolean' },
            optional: true
        },
        // Model type
        {
            itemprop: 'modelType',
            itemtype: { 
                type: 'string',
                regexp: /^(local|remote)$/
            },
            optional: true
        },
        // Model configuration
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
            itemprop: 'threads',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'batchSize',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'nGpuLayers',
            itemtype: { type: 'number' },
            optional: true
        },
        // File references
        {
            itemprop: 'modelPath',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'modelBlobHash',
            itemtype: { type: 'string' },
            optional: true
        },
        // UI state
        {
            itemprop: 'uiExpanded',
            itemtype: { type: 'boolean' },
            optional: true
        },
        {
            itemprop: 'loadProgress',
            itemtype: { type: 'number' },
            optional: true
        },
        // Metadata
        {
            itemprop: 'channelId',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'downloadUrl',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'contactId',
            itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) },
            optional: true
        },
        {
            itemprop: 'topicId',
            itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) },
            optional: true
        },
        // Summary configuration
        {
            itemprop: 'lastSummary',
            itemtype: { 
                type: 'map',
                key: { type: 'string' },
                value: { type: 'stringifiable' }
            },
            optional: true
        },
        {
            itemprop: '$versionHash$',
            itemtype: { type: 'string' },
            optional: true
        }
    ]
};

// Export the recipe as an array to match one.models pattern
export default [LLMSettingsRecipe]; 