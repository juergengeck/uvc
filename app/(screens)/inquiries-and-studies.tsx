import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Text, Surface, useTheme, IconButton } from 'react-native-paper';
import { Stack, router } from 'expo-router';
import { useInstance } from '@src/providers/app';

export default function InquiriesAndStudiesScreen() {
  const { instance, authState, isAuthenticated } = useInstance();
  console.log('[InquiriesAndStudies] Instance state:', { instance: !!instance, authState, isAuthenticated });
  const theme = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen 
        options={{
          title: 'Studies & Inquiries',
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: '#fff',
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              iconColor="#fff"
              onPress={() => router.back()}
            />
          ),
          gestureEnabled: true,
          animation: 'slide_from_right',
        }} 
      />
      <ScrollView style={styles.container}>
        <Surface style={styles.surface}>
          <Text variant="headlineMedium">Studies & Inquiries</Text>
          <Text variant="bodyMedium">No studies or inquiries available</Text>
        </Surface>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  surface: {
    padding: 16,
    elevation: 1,
    borderRadius: 8,
  },
}); 