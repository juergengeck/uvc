import type {Recipe} from '@refinio/one.core/lib/recipes.js';

export const ClickDataRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ClickData',
    rule: [
        {
            itemprop: 'x',
            itemtype: {type: 'number'},
            optional: false
        },
        {
            itemprop: 'y',
            itemtype: {type: 'number'},
            optional: false
        },
        {
            itemprop: 'timestamp',
            itemtype: {type: 'number'},
            optional: false
        },
        {
            itemprop: 'type',
            itemtype: {type: 'string'},
            optional: false
        }
    ]
};

export default [ClickDataRecipe]; 