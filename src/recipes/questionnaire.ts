import type { Questionnaire, QuestionnaireResponse } from '@refinio/one.models/lib/models/QuestionnaireModel';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object';

export type { QuestionnaireResponse };
export type { Questionnaire };

/**
 * UI-specific types for questionnaire forms
 */
export type QuestionType = 'text' | 'decimal' | 'integer' | 'choice' | 'open-choice';
export type QuestionValue = string | number | boolean | string[];

export interface QuestionOption {
    id: string;
    value: string;
    label: string;
}

export interface QuestionFormData {
    id: string;
    text: string;
    type: QuestionType;
    required: boolean;
    options?: QuestionOption[];
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;
    };
}

export interface QuestionnaireFormData {
    id: string;
    title: string;
    description?: string;
    status?: 'draft' | 'active' | 'completed';
    questions: QuestionFormData[];
}

export interface QuestionnaireFormResponse {
    questionnaireId: string;
    answers: {
        questionId: string;
        value: string | number | string[];
    }[];
}

export interface ValidationError {
    questionId: string;
    message: string;
}

// Export the QuestionnaireUI utilities for form handling
export const QuestionnaireUI = {
    // Constants
    TYPES: {
        TEXT: 'text' as const,
        DECIMAL: 'decimal' as const,
        INTEGER: 'integer' as const,
        CHOICE: 'choice' as const,
        OPEN_CHOICE: 'open-choice' as const
    },

    // Mapping functions
    mapQuestionnaireToForm,
    mapFormToQuestionnaire,
    mapFormResponseToFHIR,
    mapValueToFHIR,
    mapFHIRToValue,
    mapFHIRTypeToFormType,
    mapFormTypeToFHIRType,

    // Validation
    validateQuestionnaire: (questionnaire: QuestionnaireFormData): ValidationError[] => {
        const errors: ValidationError[] = [];
        questionnaire.questions.forEach(question => {
            if (question.required && !question.validation) {
                errors.push({
                    questionId: question.id,
                    message: 'Required question must have validation rules'
                });
            }
        });
        return errors;
    },

    // Creation helpers
    createQuestionOption: async (value: string, label?: string): Promise<QuestionOption> => {
        const optionData = {
            $type$: 'QuestionOption' as const,
            value,
            label: label || value,
            timestamp: Date.now()
        };
        const id = await calculateIdHashOfObj(optionData);
        return {
            id,
            value,
            label: label || value
        };
    },

    createQuestion: (id: string, text: string, type: QuestionType, required: boolean = false): QuestionFormData => ({
        id,
        text,
        type,
        required
    }),

    createQuestionnaire: (id: string, title: string, questions: QuestionFormData[] = []): QuestionnaireFormData => ({
        id,
        title,
        questions,
        status: 'draft'
    })
};

export default QuestionnaireUI;

/**
 * Mapping functions between FHIR and UI types
 */
export function mapQuestionnaireToForm(questionnaire: any): QuestionnaireFormData {
    return {
        id: questionnaire.id,
        title: questionnaire.title || '',
        description: questionnaire.description,
        status: questionnaire.status,
        questions: questionnaire.questions.map((q: any) => ({
            id: q.id,
            text: q.text || '',
            type: q.type as QuestionType,
            required: q.required || false,
            options: q.options?.map(async (o: any) => {
                const optionData = {
                    $type$: 'QuestionOption' as const,
                    value: o.value,
                    label: o.label || o.value,
                    timestamp: Date.now()
                };
                const id = await calculateIdHashOfObj(optionData);
                return {
                    id,
                    value: o.value,
                    label: o.label || o.value,
                };
            }),
            validation: q.validation,
        })),
    };
}

export function mapFormToQuestionnaire(form: QuestionnaireFormData): any {
    return {
        id: form.id,
        title: form.title,
        description: form.description,
        status: form.status,
        questions: form.questions.map(q => ({
            id: q.id,
            text: q.text,
            type: q.type,
            required: q.required,
            options: q.options?.map(o => ({
                id: o.id,
                value: o.value,
                label: o.label,
            })),
            validation: q.validation,
        })),
    };
}

export function mapFormResponseToFHIR(response: QuestionnaireFormResponse): any {
    return {
        resourceType: 'QuestionnaireResponse',
        questionnaire: response.questionnaireId,
        status: 'completed',
        item: response.answers.map(answer => ({
            linkId: answer.questionId,
            answer: [{
                value: typeof answer.value === 'number'
                    ? { decimal: answer.value }
                    : Array.isArray(answer.value)
                    ? { coding: answer.value.map(v => ({ code: v })) }
                    : { string: answer.value },
            }],
        })),
    };
}

export function mapValueToFHIR(value: QuestionValue, type: QuestionFormData['type']): QuestionnaireResponse['item'][0]['answer'][0] {
    switch (type) {
        case 'decimal':
            return { valueDecimal: String(value) };
        case 'integer':
            return { valueInteger: String(value) };
        case 'text':
            return { valueString: String(value) };
        case 'choice':
        case 'open-choice':
            return { valueCoding: { code: String(value) } };
        default:
            return { valueString: String(value) };
    }
}

export function mapFHIRToValue(answer: QuestionnaireResponse['item'][0]['answer'][0]): QuestionValue {
    if ('valueDecimal' in answer && answer.valueDecimal) return Number(answer.valueDecimal);
    if ('valueInteger' in answer && answer.valueInteger) return Number(answer.valueInteger);
    if ('valueString' in answer && answer.valueString) return answer.valueString;
    if ('valueCoding' in answer && answer.valueCoding?.code) return answer.valueCoding.code;
    if ('valueBoolean' in answer && answer.valueBoolean !== undefined) return answer.valueBoolean;
    return '';
}

function mapFHIRTypeToFormType(type: Questionnaire['item'][0]['type']): QuestionFormData['type'] {
    switch (type) {
        case 'decimal':
        case 'integer':
            return 'decimal';
        case 'choice':
            return 'choice';
        case 'open-choice':
            return 'open-choice';
        default:
            return 'text';
    }
}

function mapFormTypeToFHIRType(type: QuestionFormData['type']): Questionnaire['item'][0]['type'] {
    switch (type) {
        case 'decimal':
            return 'decimal';
        case 'integer':
            return 'integer';
        case 'choice':
            return 'choice';
        case 'open-choice':
            return 'open-choice';
        default:
            return 'text';
    }
}