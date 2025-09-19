/**
 * Type definitions for one.models
 * 
 * This file contains type definitions for the one.models package.
 */
import { Instance } from '@refinio/one.core/lib/recipes';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent';
import type { Person, OneObjectTypes } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';

declare module '@OneObjectInterfaces' {
    interface OneUnversionedObjectInterfaces {
        OEvent: OEvent;
    }
}

declare module '@OneModelsTypes' {
    interface OneModelsTypes {
        Instance: Instance;
        LeuteModel: LeuteModel;
        Person: Person;
        OneObjectTypes: OneObjectTypes;
        SHA256IdHash: SHA256IdHash;
    }
}

declare module '@refinio/one.models/lib/models/Model.js' {
  export class Model {
    id: string;
    name: string;
    created: number;
    modified: number;
  }
}

declare module '@refinio/one.models/lib/models/ai/AIModel.js' {
  import { Model } from '@refinio/one.models/lib/models/Model.js';

  export interface AIModel extends Model {
    size: number;
    parameters: number;
    hash: string;
    metadata: Record<string, any>;
  }
}

declare module '@refinio/one.models/lib/models/ai/ModelManager.js' {
  import { AIModel } from '@refinio/one.models/lib/models/ai/AIModel.js';

  export interface ModelManager {
    listModels(): AIModel[];
    loadModel(id: string): ArrayBuffer | null;
    deleteModel(id: string): void;
    importModel(data: ArrayBuffer, metadata: Record<string, any>): AIModel;
    importModelFromUrl(url: string, metadata: Record<string, any>): Promise<AIModel>;
  }
}

declare module '@refinio/one.models/lib/models/Authenticator/Authenticator.js' {
  export type AuthState = 'initial' | 'authenticating' | 'authenticated' | 'error';
  export type AuthEvent = 'login' | 'logout' | 'error';
}

declare module '@refinio/one.models/lib/models/SettingsModel.js' {
  export default interface PropertyTreeStore {
    constructor(oneId: string, separator?: string);
    init(): Promise<void>;
    get(key: string): any;
    set(key: string, value: any): void;
    delete(key: string): void;
    has(key: string): boolean;
    clear(): void;
    getValue(key: string): Promise<string | null>;
    setValue(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  }
} 