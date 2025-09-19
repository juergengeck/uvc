import React from 'react';
import { List, Switch } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';

/**
 * Theme Toggle Component
 * 
 * Allows users to switch between light and dark mode.
 * 
 * @component
 */
export function ThemeToggle() {
  const { t } = useTranslation('settings');
  const { isDarkMode, toggleTheme } = useAppTheme();

  return (
    <List.Item
      title={t('settings.appearance.darkMode.title', { defaultValue: 'Dark Mode' })}
      description={t('settings.appearance.darkMode.description', { defaultValue: 'Switch between light and dark theme' })}
      left={props => <List.Icon {...props} icon="theme-light-dark" />}
      right={() => (
        <Switch
          value={isDarkMode}
          onValueChange={toggleTheme}
        />
      )}
    />
  );
} 