import React from 'react';
import { View } from 'react-native';
import { List, ActivityIndicator, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Language Selector Component
 * 
 * Allows users to switch between supported languages.
 * Displays loading state during language changes and error messages if they occur.
 * 
 * @component
 */
export function LanguageSelector({ 
  selectedLanguage, 
  onLanguageChange,
  isLoading = false,
  error = null
}: LanguageSelectorProps) {
  const { t } = useTranslation('settings');
  const theme = useTheme();
  const { styles } = useAppTheme();

  // Debug output
  console.log('[LanguageSelector] Translation namespace:', 'settings');
  console.log('[LanguageSelector] Raw keys:', {
    current: t('settings.language.current'),
    en: t('settings.language.en'),
    de: t('settings.language.de'),
    fr: t('settings.language.fr')
  });

  const languages = [
    { code: 'en', name: t('settings.language.en'), icon: '🇬🇧' },
    { code: 'de', name: t('settings.language.de'), icon: '🇩🇪' },
    { code: 'fr', name: t('settings.language.fr'), icon: '🇫🇷' }
  ];

  return (
    <>
      <List.Item
        title={t('settings.language.current')}
        description={error || languages.find(l => l.code === selectedLanguage)?.name}
        descriptionStyle={error ? { color: theme.colors.error } : undefined}
        left={props => <List.Icon {...props} icon="translate" />}
        style={styles.settingsItem}
        right={props => 
          isLoading ? (
            <ActivityIndicator 
              size={20} 
              color={theme.colors.primary}
              style={{ marginRight: 8 }}
            />
          ) : null
        }
      />
      {languages.map((language, index) => (
        <React.Fragment key={language.code}>
          <List.Item
            title={`${language.icon}  ${language.name}`}
            onPress={() => !isLoading && onLanguageChange(language.code)}
            disabled={isLoading}
            style={[
              styles.settingsItem,
              index === languages.length - 1 && styles.settingsItemLast
            ]}
            right={props => 
              selectedLanguage === language.code ? 
                <List.Icon {...props} icon="check" /> : 
                null
            }
          />
          {index < languages.length - 1 && <View style={styles.settingsDivider} />}
        </React.Fragment>
      ))}
    </>
  );
} 