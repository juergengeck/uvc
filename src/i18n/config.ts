/**
 * Enhanced i18n configuration
 * 
 * This is a standalone module that enhances the root i18n instance
 * with additional resources.
 */

// Import i18n directly from i18next first, to access its methods
import i18next from 'i18next';
// Then import the initialized instance (should match the root i18n)
import i18n from '../../i18n';
import { SettingsStore } from '@refinio/one.core/lib/system/settings-store.js';

// Import translations
import navigationDE from '../locales/de/navigation.json';
import navigationEN from '../locales/en/navigation.json';
import navigationFR from '../locales/fr/navigation.json';
import settingsDE from '../locales/de/settings.json';
import settingsEN from '../locales/en/settings.json';
import settingsFR from '../locales/fr/settings.json';
import commonDE from '../locales/de/common.json';
import commonEN from '../locales/en/common.json';
import commonFR from '../locales/fr/common.json';
import journalDE from '../locales/de/journal.json';
import journalEN from '../locales/en/journal.json';
import journalFR from '../locales/fr/journal.json';
import messagesDE from '../locales/de/messages.json';
import messagesEN from '../locales/en/messages.json';
import messagesFR from '../locales/fr/messages.json';
import buttonsDE from '../locales/de/ui/buttons.json';
import buttonsEN from '../locales/en/ui/buttons.json';
import buttonsFR from '../locales/fr/ui/buttons.json';
import registrationDE from '../locales/de/auth/registration.json';
import registrationEN from '../locales/en/auth/registration.json';
import registrationFR from '../locales/fr/auth/registration.json';
import calendarDE from '../locales/de/calendar.json';
import calendarEN from '../locales/en/calendar.json';
import calendarFR from '../locales/fr/calendar.json';
import contactsDE from '../locales/de/contacts.json';
import contactsEN from '../locales/en/contacts.json';
import contactsFR from '../locales/fr/contacts.json';
import devicesEN from '../locales/en/devices.json';
import devicesDE from '../locales/de/devices.json';
import devicesFR from '../locales/fr/devices.json';
import chatDE from '../locales/de/chat.json';
import chatEN from '../locales/en/chat.json';
import chatFR from '../locales/fr/chat.json';
import healthDE from '../locales/de/health.json';
import healthEN from '../locales/en/health.json';
import healthFR from '../locales/fr/health.json';

// All resources we want to add to i18n
const resources = {
  de: {
    navigation: navigationDE,
    settings: settingsDE,
    common: commonDE,
    journal: journalDE,
    messages: messagesDE,
    buttons: buttonsDE,
    registration: registrationDE,
    calendar: calendarDE,
    contacts: contactsDE,
    devices: devicesDE,
    chat: chatDE,
    health: healthDE
  },
  en: {
    navigation: navigationEN,
    settings: settingsEN,
    common: commonEN,
    journal: journalEN,
    messages: messagesEN,
    buttons: buttonsEN,
    registration: registrationEN,
    calendar: calendarEN,
    contacts: contactsEN,
    devices: devicesEN,
    chat: chatEN,
    health: healthEN
  },
  fr: {
    navigation: navigationFR,
    settings: settingsFR,
    common: commonFR,
    journal: journalFR,
    messages: messagesFR,
    buttons: buttonsFR,
    registration: registrationFR,
    calendar: calendarFR,
    contacts: contactsFR,
    devices: devicesFR,
    chat: chatFR,
    health: healthFR
  }
};

// Function to load stored language (can be used after initialization)
export async function getStoredLanguage(): Promise<string | null> {
  try {
    return await SettingsStore.getItem('app_language') as string | null;
  } catch (error) {
    console.error('[i18n] Error getting stored language:', error);
    return null;
  }
}

// Function to save language preference
export async function setStoredLanguage(language: string): Promise<void> {
  try {
    await SettingsStore.setItem('app_language', language);
    
    // Ensure i18n instance is available before calling changeLanguage
    const i18nInstance = i18n || i18next;
    if (i18nInstance && typeof i18nInstance.changeLanguage === 'function') {
      await i18nInstance.changeLanguage(language);
    } else {
      console.warn('[i18n] i18n instance not ready, language will be applied on next initialization');
    }
  } catch (error) {
    console.error('[i18n] Error setting stored language:', error);
  }
}

// Add resources to the i18n instance in a safe way
try {
  // Use the default export from i18next as a fallback if the instance is not working
  const i18nInstance = typeof i18n.addResourceBundle === 'function' ? i18n : i18next;
  
  // Add resources for each language and namespace
  Object.keys(resources).forEach(lang => {
    Object.keys(resources[lang]).forEach(ns => {
      if (typeof i18nInstance.addResourceBundle === 'function') {
        i18nInstance.addResourceBundle(lang, ns, resources[lang][ns], true, true);
      } else {
        console.warn(`[i18n] Unable to add resource bundle for ${lang}/${ns} - addResourceBundle not found`);
      }
    });
  });
  
  console.log('[i18n] Enhanced configuration applied successfully');
} catch (error) {
  console.error('[i18n] Error applying enhanced configuration:', error);
}

// Export the i18n instance from the root
export default i18n; 