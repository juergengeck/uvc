/**
 * i18n namespace constants
 * Use these constants when accessing translations to avoid typos and maintain consistency
 */
export const Namespaces = {
  COMMON: 'common',
  NAVIGATION: 'navigation',
  SETTINGS: 'settings',
  JOURNAL: 'journal',
  MESSAGES: 'messages',
  CONTACTS: 'contacts',
  CHAT: 'chat',
  UI: {
    BUTTONS: 'buttons'
  },
  AUTH: {
    REGISTRATION: 'registration'
  }
} as const;

// Type for namespace values
export type NamespaceKey = typeof Namespaces[keyof typeof Namespaces]; 