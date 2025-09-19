/**
 * i18n configuration and exports
 * 
 * This module provides:
 * - i18n instance reference from root
 * - Namespace constants for type-safe translation keys
 * - Language utilities
 */

// Import i18n directly from root to avoid circular dependencies
import i18n from '../../i18n';
export * from './namespaces';

// Language utilities
export const supportedLanguages = ['de', 'en', 'fr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage = 'en' as const;

export const getLanguageLabel = (lang: SupportedLanguage): string => {
  switch (lang) {
    case 'en':
      return 'English';
    case 'fr':
      return 'Français';
    default:
      return 'Deutsch';
  }
};

// Declare module augmentation for i18next
declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
  }
}

// Export the i18n instance from root
export default i18n; 