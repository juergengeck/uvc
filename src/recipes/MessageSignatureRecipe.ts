/**
 * Message Signature Recipe
 * 
 * Defines the recipe for MessageSignature objects used to authenticate messages.
 */

import type { Recipe } from '@refinio/one.core/lib/recipes.js';

/**
 * Recipe for MessageSignature objects.
 * These objects are used to certify and authenticate message senders.
 */
export const MessageSignatureRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'MessageSignature',
    rule: [
        {
            itemprop: 'signer',
            itemtype: { type: 'string' },
            optional: false
        },
        {
            itemprop: 'timestamp',
            itemtype: { type: 'number' },
            optional: false
        },
        {
            itemprop: 'certificate',
            itemtype: { type: 'string' },
            optional: false
        }
    ]
};

export default {
    Recipe: MessageSignatureRecipe
}; 