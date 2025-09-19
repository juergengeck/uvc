import React, { useState } from 'react';
import { View, Platform, Alert, StyleSheet } from 'react-native';
import { Text, Button, Surface, IconButton } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';

export default function DataManagementScreen() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    try {
      setLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const data = JSON.parse(fileContent);

      // TODO: Implement microdata-imploder functionality
      console.log('Importing data:', data);

      Alert.alert(
        'Import Successful',
        'Your data has been imported successfully.'
      );
    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert(
        'Import Failed',
        'Failed to import data. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    try {
      setLoading(true);

      // TODO: Implement microdata-exploder functionality
      const data = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: {}
      };

      const fileUri = `${FileSystem.cacheDirectory}digionko-export-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2));

      if (Platform.OS === 'ios') {
        await Sharing.shareAsync(fileUri);
      } else {
        // Android: Save to downloads
        const downloadPath = `${FileSystem.documentDirectory}digionko-export-${Date.now()}.json`;
        await FileSystem.copyAsync({
          from: fileUri,
          to: downloadPath
        });
        Alert.alert(
          'Export Successful',
          'Your data has been exported successfully.'
        );
      }
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert(
        'Export Failed',
        'Failed to export data. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('settings.dataManagement'),
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
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="database-import" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.sectionHeaderText}>{t('settings.importData.title')}</Text>
          </View>
          <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.importData.description')}
          </Text>
          <Button
            mode="contained"
            onPress={handleImport}
            style={styles.button}
            icon="database-import"
            loading={loading}
          >
            {t('settings.importData.title')}
          </Button>
        </Surface>

        <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="database-export" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.sectionHeaderText}>{t('settings.exportData.title')}</Text>
          </View>
          <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.exportData.description')}
          </Text>
          <Button
            mode="contained"
            onPress={handleExport}
            style={styles.button}
            icon="database-export"
            loading={loading}
          >
            {t('settings.exportData.title')}
          </Button>
        </Surface>

        <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.infoContainer}>
            <MaterialCommunityIcons name="information" size={20} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
              {t('settings.dataManagement.info')}
            </Text>
          </View>
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
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderText: {
    marginLeft: 8,
  },
  description: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
  },
  backButton: {
    marginLeft: -4,
  },
}); 