/**
 * Questionnaire Types Module
 * 
 * Defines the TypeScript types for questionnaire-related objects.
 * This includes:
 * - Questionnaire data
 * - Questionnaire responses
 * - Questionnaire status updates
 * 
 * @module QuestionnaireTypes
 */

import type { OneObjectTypeNames } from '@refinio/one.core/lib/recipes';
import type { QuestionnaireResponse, Questionnaire } from '@refinio/one.models/lib/models/QuestionnaireModel';

// Core interfaces
export interface QuestionnaireData {
    $type$: 'QuestionnaireData';
    type: string;
    data: Questionnaire;
}

export interface QuestionnaireResponseData {
    $type$: 'QuestionnaireResponseData';
    type: string;
    data: QuestionnaireResponse;
}

export interface QuestionnaireStatusData {
    $type$: 'QuestionnaireStatusData';
    type: string;
    data: { status: 'active' | 'completed' };
}

// Register interfaces with one.core
declare module '@OneObjectInterfaces' {
    interface OneUnversionedObjectInterfaces {
        QuestionnaireData: QuestionnaireData;
        QuestionnaireResponseData: QuestionnaireResponseData;
        QuestionnaireStatusData: QuestionnaireStatusData;
    }
}