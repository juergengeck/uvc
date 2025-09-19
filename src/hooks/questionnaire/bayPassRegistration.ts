import type { Questionnaire } from '@src/types/questionnaire';

export interface BayPassRegistrationQuestionnaire extends Questionnaire {
  type: 'baypass_registration';
  data: {
    isLegalAge?: boolean;
    birthYear?: number;
    agreedTerms?: boolean;
    email?: string;
    password?: string;
    platformCredentials?: {
      accessToken?: string;
      refreshToken?: string;
      userId?: string;
    };
  };
} 