/**
 * Core Type Declarations
 * 
 * This file serves as a central point for type declarations and re-exports
 * to ensure types are available globally where needed.
 */

import type { CanRiskData } from '../recipes/canrisk/types';
import type { HealthSnapshot } from './health';

// Re-export types
export type {
    CanRiskData,
    HealthSnapshot
};

// Declare module augmentations
declare module '@refinio/one.core/lib/recipes' {
    interface OneUnversionedObjectInterfaces {
        CanRiskData: CanRiskData;
        HealthSnapshot: HealthSnapshot;
    }
}

// Ensure this is treated as a module
export {}; 