import React from 'react';
import { View, StyleSheet } from 'react-native';
import { List } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { useSettings } from '@src/providers/app/SettingsProvider';

export default function LanguageSelectionScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { language, setLanguage } = useSettings();

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
  ];

  const handleLanguageSelect = (code: string) => {
    setLanguage(code);
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {languages.map((lang) => (
        <List.Item
          key={lang.code}
          title={lang.name}
          onPress={() => handleLanguageSelect(lang.code)}
          right={(props) =>
            language === lang.code ? (
              <List.Icon {...props} icon="check" />
            ) : null
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
}); 