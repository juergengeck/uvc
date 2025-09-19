import React from 'react';
import { ScrollView, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { useTheme } from '@src/providers/app/AppTheme';

interface ScreenSectionProps {
  title?: string;
  children: React.ReactNode;
}

export function ScreenSection({ title, children }: ScreenSectionProps) {
  const { theme, styles: themedStyles } = useTheme();
  
  return (
    <View style={themedStyles.section}>
      {title && (
        <Text style={themedStyles.sectionHeader}>{title}</Text>
      )}
      <View style={themedStyles.surfaceContainer}>
        <Surface style={themedStyles.surface}>
          {children}
        </Surface>
      </View>
    </View>
  );
}

interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  loading?: boolean;
}

/**
 * Base screen component that provides consistent layout and styling
 * 
 * @example
 * ```tsx
 * <Screen>
 *   <ScreenSection title="Section Title">
 *     <List.Item title="Item" />
 *   </ScreenSection>
 * </Screen>
 * ```
 */
export function Screen({ children, scrollable = true, loading }: ScreenProps) {
  const { theme, styles: themedStyles } = useTheme();
  
  const Container = scrollable ? ScrollView : View;
  
  return (
    <Container style={themedStyles.screenContainer}>
      {loading && (
        <View style={themedStyles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
      {children}
    </Container>
  );
} 