import type {Recipe} from '@refinio/one.core/lib/recipes.js';
import type { JournalEntry } from '@OneObjectInterfaces';

export const JournalEntryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'JournalEntry',
    rule: [
        {
            itemprop: 'id',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'timestamp',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'type',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'data',
            itemtype: { type: 'stringifiable' }
        },
        {
            itemprop: 'userId',
            itemtype: { type: 'string' },
            optional: true
        }
    ]
};

// Re-export the type from ambient module for convenience
export type { JournalEntry } from '@OneObjectInterfaces';

const JournalRecipes: Recipe[] = [JournalEntryRecipe];
export default JournalRecipes; 