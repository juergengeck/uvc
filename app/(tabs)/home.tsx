import React from 'react';
import { ScrollView, StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { TopicsCard } from '@src/components/home/TopicsCard';
import { JournalCard } from '@src/components/home/JournalCard';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { useTranslation } from 'react-i18next';
import { Namespaces } from '@src/i18n/namespaces';
import { useInstance } from '@src/providers/app';
import { useDeepLinks } from '@src/hooks/useDeepLinks';

console.log('=== LOADING TABS HOME PAGE ===');

export default function TabsHome() {
  const { styles: themedStyles, theme, isDarkMode } = useAppTheme();
  const { t } = useTranslation(Namespaces.NAVIGATION);
  
  // Use same hook as Messages tab for consistency and reactivity
  const { instance, isAuthenticated, models } = useInstance();
  
  // Enable deep link handling for invitation URLs
  useDeepLinks();
  
  console.log(`[TabsHome] Auth state: ${isAuthenticated ? 'authenticated' : 'not authenticated'}, models available: ${!!models}`);
  
  // Force dark background immediately to prevent white flash
  const backgroundColor = isDarkMode ? '#121212' : theme.colors.background || '#ffffff';
  
  // Wrap everything in a View with immediate background color
  return (
    <View style={[styles.container, { backgroundColor }]}>
      {(!isAuthenticated || !models) ? (
        <View style={[themedStyles.screenContainer, styles.centered, { backgroundColor }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.onBackground }]}>Loading data...</Text>
        </View>
      ) : (
        <ScrollView style={[themedStyles.screenContainer, { backgroundColor }]}>
          <TopicsCard />
          <JournalCard />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  }
}); 