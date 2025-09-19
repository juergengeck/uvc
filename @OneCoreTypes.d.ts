/// <reference path="./node_modules/one.core/lib/recipes.d.ts" />
/// <reference path="./node_modules/one.core/lib/util/type-checks.d.ts" />
/// <reference path="./@OneCoreErrors.d.ts" />
/// <reference path="./@OneCoreObjects.d.ts" />

declare module '@OneCoreTypes' {
    export * from '@refinio/one.core/lib/recipes';
    export * from '@refinio/one.core/lib/util/type-checks';
    export * from '@refinio/one.core/lib/storage-base-common';
    export * from '@refinio/one.core/lib/websocket-promisifier';
    export * from '@refinio/one.core/lib/errors';
    export * from '@refinio/one.core/lib/objects';
}

declare module '@refinio/one.core/lib/recipes' {
    export type OneObjectTypeNames = 
        | 'AIProcessingStatus'
        | 'AIResponse'
        | 'LocalAIConfig'
        | 'AIProviderConfig'
        | OneVersionedObjectTypeNames;
} 