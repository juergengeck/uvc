// Primary, simplified i18n initialization with no dependencies on other modules
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// Use device locale in a synchronous way with proper error handling
const locales = Localization.getLocales();
const deviceLanguage = locales[0]?.languageCode || 'en';
const supportedLanguages = ['de', 'en', 'fr'];
const defaultLanguage = 'en';

// Always default to English unless explicitly set otherwise
const initialLanguage = defaultLanguage;

console.log('[i18n] Device language detected:', deviceLanguage);
console.log('[i18n] Using initial language:', initialLanguage);

// IMPORTANT: This is a minimal synchronous configuration
// The full resources will be loaded in src/i18n/config.ts later
i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    lng: initialLanguage,
    fallbackLng: defaultLanguage,
    resources: {
      en: {
        common: {
          loading: 'Loading...',
          error: 'Error',
          retry: 'Retry'
        }
      },
      de: {
        common: {
          loading: 'Wird geladen...',
          error: 'Fehler',
          retry: 'Wiederholen'
        }
      },
      fr: {
        common: {
          loading: 'Chargement...',
          error: 'Erreur',
          retry: 'Réessayer'
        }
      }
    },
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    }
  });

console.log('[i18n] Basic initialization complete, language:', i18n.language);

export default i18n; 