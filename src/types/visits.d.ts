/**
 * Visit Type Definitions
 */

// Core visit types
export interface Visit {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    questionnaires: string[];  // URLs of questionnaires
    color?: string;
}

export interface VisitSchedule {
    id: string;
    visits: Visit[];
    lastUpdated: string;
}

// Export module augmentations
declare module '@refinio/one.models/lib/models/visits/VisitManager' {
    export { Visit, VisitSchedule };
}

declare module '@refinio/one.models/lib/recipes/visits/types' {
    export { Visit, VisitSchedule };
}

export type {
    Visit,
    VisitSchedule
};

// Default export to satisfy module requirements
export default interface VisitTypes {
    Visit: Visit;
    VisitSchedule: VisitSchedule;
} 