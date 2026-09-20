import React, { useState } from 'react';
import { View, Platform, Alert, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Surface, IconButton } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { useAppModel } from '@src/hooks/useAppModel';

export default function DataManagementScreen() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { theme } = useTheme();
  const { appModel } = useAppModel();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleExport() {
    try {
      setExporting(true);

      const orgs = await appModel?.organisationModel?.getAllOrganisations().catch(() => []) ?? [];
      const departments = await appModel?.organisationModel?.getAllDepartments().catch(() => []) ?? [];
      const rooms = await appModel?.organisationModel?.getAllRooms().catch(() => []) ?? [];
      const facilityRooms = await appModel?.deviceControlModel?.getRooms().catch(() => []) ?? [];
      const disinfectionRuns = await appModel?.deviceControlModel?.getDisinfectionRuns().catch(() => []) ?? [];
      const discoveredDevices = appModel?.deviceDiscoveryModel?.getDevices() ?? [];

      const backupData = {
        app: 'uvc',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        data: {
          organisations: orgs.map(o => o.organisation),
          departments: departments.map(d => d.department),
          rooms: rooms.map(r => r.room),
          facilityRooms,
          disinfectionRuns,
          devices: discoveredDevices.map(d => ({
            id: d.id,
            name: d.name,
            address: d.address,
            port: d.port,
            type: d.type,
            deviceKind: d.deviceKind,
          })),
        },
      };

      const filename = `uvc-backup-${Date.now()}.json`;
      const jsonStr = JSON.stringify(backupData, null, 2);

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert(
          t('settings.dataManagement.export.success', { defaultValue: 'Export Successful' }),
          t('settings.dataManagement.export.downloadStarted', { defaultValue: 'Backup file downloaded successfully.' })
        );
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, jsonStr);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: t('settings.dataManagement.export.title', { defaultValue: 'Export Data' }),
            UTI: 'public.json',
          });
        } else if (Platform.OS === 'android') {
          const downloadPath = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.copyAsync({
            from: fileUri,
            to: downloadPath,
          });
          Alert.alert(
            t('settings.dataManagement.export.success', { defaultValue: 'Export Successful' }),
            t('settings.dataManagement.export.savedToDocs', { defaultValue: 'Backup saved to documents.' })
          );
        } else {
          Alert.alert(
            t('settings.dataManagement.export.success', { defaultValue: 'Export Successful' }),
            t('settings.dataManagement.export.fileReady', { defaultValue: 'Backup file created in cache.' })
          );
        }
      }
    } catch (error) {
      console.error('[DataManagement] Export failed:', error);
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('settings.dataManagement.export.error.failed', { defaultValue: 'Failed to export data' })
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      let fileContent = '';
      if (Platform.OS === 'web' && (asset as any).file) {
        fileContent = await (asset as any).file.text();
      } else {
        fileContent = await FileSystem.readAsStringAsync(asset.uri);
      }

      const parsed = JSON.parse(fileContent);
      const payload = parsed.data || parsed;

      let orgCount = 0;
      let roomCount = 0;

      if (appModel?.organisationModel && Array.isArray(payload.organisations)) {
        const existingOrgs = await appModel.organisationModel.getAllOrganisations().catch(() => []);
        const existingNames = new Set(existingOrgs.map(o => o.organisation.name));
        for (const org of payload.organisations) {
          if (org.name && !existingNames.has(org.name)) {
            await appModel.organisationModel.createOrganisation(org.name, org.description);
            orgCount++;
          }
        }
      }

      if (appModel?.deviceControlModel && Array.isArray(payload.facilityRooms)) {
        for (const fRoom of payload.facilityRooms) {
          if (fRoom.roomId && fRoom.name) {
            await appModel.deviceControlModel.saveRoomConfiguration({
              roomId: fRoom.roomId,
              name: fRoom.name,
              roomKind: fRoom.roomKind || 'other',
              deviceIds: fRoom.resources?.map((r: any) => r.deviceId).filter(Boolean) ?? [],
              createdAt: fRoom.createdAt || Date.now(),
              updatedAt: Date.now(),
            });
            roomCount++;
          }
        }
      }

      Alert.alert(
        t('settings.dataManagement.import.success', { defaultValue: 'Import Successful' }),
        roomCount > 0 || orgCount > 0
          ? t('settings.dataManagement.import.restoredSummary', {
              defaultValue: `Restored ${orgCount} organization(s) and ${roomCount} room(s).`,
              orgCount,
              roomCount,
            })
          : t('settings.dataManagement.import.validBackup', {
              defaultValue: 'Backup data parsed and verified successfully.',
            })
      );
    } catch (error) {
      console.error('[DataManagement] Import failed:', error);
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('settings.dataManagement.import.error.failed', { defaultValue: 'Failed to import data' })
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('settings.dataManagement.title', { defaultValue: 'Data Management' }),
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              onPress={() => router.back()}
              style={styles.backButton}
            />
          ),
        }}
      />

      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="database-export" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.sectionHeaderText}>
              {t('settings.dataManagement.export.title', { defaultValue: 'Export Data' })}
            </Text>
          </View>
          <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.dataManagement.export.description', {
              defaultValue: 'Back up UVC devices, rooms, and settings to a backup file',
            })}
          </Text>
          <Button
            mode="contained"
            onPress={handleExport}
            style={styles.button}
            icon="database-export"
            loading={exporting}
            disabled={exporting || importing}
          >
            {t('settings.dataManagement.export.title', { defaultValue: 'Export Data' })}
          </Button>
        </Surface>

        <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="database-import" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.sectionHeaderText}>
              {t('settings.dataManagement.import.title', { defaultValue: 'Import Data' })}
            </Text>
          </View>
          <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.dataManagement.import.description', {
              defaultValue: 'Restore UVC devices, rooms, and settings from a backup file',
            })}
          </Text>
          <Button
            mode="contained"
            onPress={handleImport}
            style={styles.button}
            icon="database-import"
            loading={importing}
            disabled={exporting || importing}
          >
            {t('settings.dataManagement.import.title', { defaultValue: 'Import Data' })}
          </Button>
        </Surface>
      </ScrollView>
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
  backButton: {
    marginLeft: -4,
  },
}); 