import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks.js';
import type {VersionNode} from '@refinio/one.core/lib/recipes.js';

export interface InitOptions {
    commServerUrl: string;
    instanceName?: string;
    onPhaseChange?: (phase: string) => void;
}

declare module '@refinio/one.core/lib/recipes' {
    interface OneObjectTypeNames {
        // Remove AIErrorState
    }

    interface RecipeTypes {
        // Remove AIErrorState
    }

    interface OneUnversionedObjectInterfaces {
        // Remove AIErrorState
    }
}

declare module '@OneObjectInterfaces' {
    export interface OneVersionedObjectInterfaces {
        ClickData: ClickData;
        RoleCertificate: any;
    }
}

export interface ClickData {
    $type$: 'ClickData';
    $versionHash$?: SHA256Hash<VersionNode>;
    x: number;
    y: number;
    timestamp: number;
    type: string;
}

// Add empty default export since this is a types file
export default {};