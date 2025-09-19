import 'react-i18next';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof import('../locales/en/common.json');
      navigation: typeof import('../locales/en/navigation.json');
      settings: typeof import('../locales/en/settings.json');
      tasks: typeof import('../locales/en/tasks.json');
      buttons: typeof import('../locales/en/ui/buttons.json');
      registration: typeof import('../locales/en/auth/registration.json');
    };
  }
} 