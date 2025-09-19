/**
 * Questionnaire Type Definitions
 */

// Core questionnaire types
export interface QuestionnaireItem {
    linkId: string;
    text: string;
    type: 'choice' | 'text' | 'integer' | 'decimal' | 'date' | 'boolean';
    required?: boolean;
    prefix?: string;
    options?: QuestionnaireOption[];
    validation?: QuestionnaireValidation;
    enableWhen?: EnableWhen[];
    disabledDisplay?: string;
    item?: QuestionnaireItem[];
    answer?: Answer[];
}

export interface QuestionnaireOption {
    valueCoding: {
        code: string;
        version: string;
        display: string;
        system: string;
    };
}

export interface QuestionnaireValidation {
    min?: number;
    max?: number;
    pattern?: string;
}

export interface EnableWhen {
    question: string;
    operator: string;
    answerCoding: {
        code: string;
    };
}

export interface Answer {
    valueCoding?: {
        code: string;
        display?: string;
    };
    valueString?: string;
    valueInteger?: number;
    valueDecimal?: number;
    valueDate?: string;
    valueBoolean?: boolean;
}

export interface QuestionnaireData {
    id: string;
    title: string;
    items: QuestionnaireItem[];
}

export type QuestionType = 'choice' | 'text' | 'integer' | 'decimal' | 'date' | 'boolean';

// Export module augmentations
declare module '@refinio/one.models/lib/models/QuestionnaireModel' {
    export interface Questionnaire {
        resourceType: 'Questionnaire';
        language: string;
        url: string;
        title: string;
        name: string;
        status: string;
        item: QuestionnaireItem[];
    }

    export interface QuestionnaireResponse {
        resourceType: 'QuestionnaireResponse';
        questionnaire: string;
        status: string;
        item: QuestionnaireItem[];
    }

    export { QuestionnaireItem, Answer };
}

declare module '@refinio/one.models/lib/recipes/Questionnaire/types' {
    export { QuestionnaireItem, QuestionnaireData, QuestionType };
}

// Default export to satisfy module requirements
export default interface QuestionnaireTypes {
    QuestionnaireItem: QuestionnaireItem;
    QuestionnaireData: QuestionnaireData;
    QuestionType: QuestionType;
    Answer: Answer;
} 