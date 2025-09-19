import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, IconButton } from 'react-native-paper';
import { useInstance } from '@src/providers/app';
import { useTheme } from '@src/providers/app/AppTheme';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';

export default function ConsentPage() {
  const { instance } = useInstance();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          title: t('settings.consent'),
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              onPress={() => router.back()}
              style={styles.backButton}
            />
          ),
        }}
      />
      
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.consent')}
          </Text>
          <Text style={{ 
            textAlign: 'center',
            color: theme.colors.onSurfaceVariant,
            padding: 16
          }}>
            Your consent settings will appear here
          </Text>
        </Surface>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    padding: 16,
    paddingBottom: 8,
  },
  backButton: {
    marginLeft: -4,
  },
});