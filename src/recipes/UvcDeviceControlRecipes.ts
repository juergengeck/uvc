import type {Recipe} from '@refinio/one.core/lib/recipes.js';

export const UvcDeviceControlCommandRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'UvcDeviceControlCommand',
  rule: [
    {itemprop: 'requestId', itemtype: {type: 'string'}, isId: true},
    {itemprop: 'targetDeviceId', itemtype: {type: 'string'}},
    {itemprop: 'targetKind', itemtype: {type: 'string'}},
    {itemprop: 'operation', itemtype: {type: 'string'}},
    {itemprop: 'capability', itemtype: {type: 'string'}},
    {itemprop: 'desiredEnabled', itemtype: {type: 'boolean'}, optional: true},
    {itemprop: 'desiredIntensity', itemtype: {type: 'number'}, optional: true},
    {itemprop: 'issuer', itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}},
    {itemprop: 'issuedAt', itemtype: {type: 'integer'}},
  ],
};

export const UvcDeviceControlObservationRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'UvcDeviceControlObservation',
  rule: [
    {itemprop: 'request', itemtype: {type: 'referenceToObj', allowedTypes: new Set(['UvcDeviceControlCommand'])}, isId: true},
    {itemprop: 'producerDeviceId', itemtype: {type: 'string'}},
    {itemprop: 'status', itemtype: {type: 'string'}},
    {itemprop: 'enabled', itemtype: {type: 'boolean'}, optional: true},
    {itemprop: 'intensity', itemtype: {type: 'number'}, optional: true},
    {itemprop: 'observedAt', itemtype: {type: 'string'}},
    {itemprop: 'error', itemtype: {type: 'string'}, optional: true},
  ],
};

export const UVC_DEVICE_CONTROL_RECIPES: Recipe[] = [
  UvcDeviceControlCommandRecipe,
  UvcDeviceControlObservationRecipe,
];
