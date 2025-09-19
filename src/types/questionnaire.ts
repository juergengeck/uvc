export interface Questionnaire {
  id: string;
  type: string;
  version: number;
  data: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface QuestionnaireItem {
  id: string;
  type: string;
  question: string;
  required: boolean;
  options?: string[];
  value?: any;
} 