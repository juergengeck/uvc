export type PrefillingQuestionnaireAnswer = Array<{
    valueInteger?: string;
    valueString?: string;
    valueCoding?: {
        code: string;
        display?: string;
    };
}> | undefined; 