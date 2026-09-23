import React, {useState} from 'react';
import {Alert, Platform, ScrollView, StyleSheet, View} from 'react-native';
import {Button, IconButton, Surface, Text} from 'react-native-paper';
import {Stack, useRouter} from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {useTranslation} from 'react-i18next';
import {useTheme} from '@src/providers/app/AppTheme';
import {useAppModel} from '@src/hooks/useAppModel';
import {
  type MobileUvcWorkbookData,
  writeMobileUvcWorkbook,
} from '@src/data/uvc-mobile-workbook';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';
const ROOM_KINDS = new Set([
  'treatment-room', 'bathroom', 'operating-room', 'laboratory', 'other',
]);

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export default function DataManagementScreen() {
  const {t} = useTranslation('settings');
  const router = useRouter();
  const {theme} = useTheme();
  const {appModel} = useAppModel();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  async function collectWorkbookData(): Promise<MobileUvcWorkbookData> {
    if (!appModel?.organisationModel || !appModel.deviceControlModel || !appModel.deviceDiscoveryModel) {
      throw new Error('UVC data models are not ready yet. Try again after initialization completes.');
    }
    const [organisations, departments, rooms, facilityRooms, treatmentRuns] = await Promise.all([
      appModel.organisationModel.getAllOrganisations(),
      appModel.organisationModel.getAllDepartments(),
      appModel.organisationModel.getAllRooms(),
      appModel.deviceControlModel.getRooms(),
      appModel.deviceControlModel.getDisinfectionRuns(),
    ]);
    const devices = appModel.deviceDiscoveryModel.getDevices();

    return {
      exportedAt: new Date().toISOString(),
      organisations: organisations.map(({hash, organisation}) => ({
        hash: String(hash),
        name: organisation.name,
        description: organisation.description,
        owner: String(organisation.owner),
        created: organisation.created,
        modified: organisation.modified,
      })),
      departments: departments.map(({hash, department}) => ({
        hash: String(hash),
        name: department.name,
        description: department.description,
        owner: String(department.owner),
        organisation: String(department.organisation),
        created: department.created,
        modified: department.modified,
      })),
      rooms: rooms.map(({hash, room}) => ({
        hash: String(hash),
        name: room.name,
        description: room.description,
        owner: String(room.owner),
        department: String(room.department),
        roomKind: typeof room.settings?.roomKind === 'string' ? room.settings.roomKind : 'other',
        deviceIds: (room.devices ?? []).map(String),
        created: room.created,
        modified: room.modified,
      })),
      facilityRooms: facilityRooms.map(room => ({
        roomId: room.roomId,
        name: room.name,
        roomKind: room.roomKind,
        ownerPersonId: String(room.ownerPersonId),
        producerInstanceId: String(room.producerInstanceId),
        resourceHashes: [...room.resources].map(String),
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      })),
      treatmentRuns: treatmentRuns.map(run => ({
        runId: run.runId,
        roomIdHash: String(run.room),
        roomName: run.roomName,
        roomKind: run.roomKind,
        status: run.status,
        scheduledAt: run.scheduledAt,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        uvcDoseMjCm2: run.uvcDoseMjCm2,
        notes: run.notes,
        resourceHashes: [...run.resources].map(String),
        startObservationHashes: [...(run.startObservations ?? [])].map(String),
        stopObservationHashes: [...(run.stopObservations ?? [])].map(String),
      })),
      devices: devices.map(device => ({
        id: device.deviceId,
        name: device.name,
        type: device.deviceType,
        address: device.address,
        port: device.port,
        online: device.online,
        lastSeen: device.lastSeen,
      })),
    };
  }

  async function handleExport() {
    try {
      setExporting(true);
      const data = await collectWorkbookData();
      const filename = `uvc-data-${data.exportedAt.slice(0, 10)}.xlsx`;

      if (Platform.OS === 'web') {
        const bytes = writeMobileUvcWorkbook(data, 'array') as ArrayBuffer;
        const url = URL.createObjectURL(new Blob([bytes], {type: XLSX_MIME}));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }

      const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!directory) throw new Error('No writable export directory is available.');
      const fileUri = `${directory}${filename}`;
      const base64 = writeMobileUvcWorkbook(data, 'base64') as string;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: XLSX_MIME,
          dialogTitle: 'Export UVC data',
          UTI: XLSX_UTI,
        });
      } else if (FileSystem.documentDirectory) {
        const savedUri = `${FileSystem.documentDirectory}${filename}`;
        if (savedUri !== fileUri) await FileSystem.copyAsync({from: fileUri, to: savedUri});
        Alert.alert('Export complete', `Workbook saved as ${filename}.`);
      } else {
        throw new Error('Sharing is unavailable and no documents directory can be written.');
      }
    } catch (error) {
      console.error('[DataManagement] Export failed:', error);
      Alert.alert('Export failed', messageFromError(error));
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    try {
      setImporting(true);
      if (!appModel?.organisationModel || !appModel.deviceControlModel) {
        throw new Error('UVC data models are not ready yet. Try again after initialization completes.');
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileContent = Platform.OS === 'web' && asset.file
        ? await asset.file.text()
        : await FileSystem.readAsStringAsync(asset.uri);
      const parsed = requireRecord(JSON.parse(fileContent), 'Backup');
      if ('app' in parsed && parsed.app !== 'uvc') {
        throw new Error('This JSON file is not a UVC backup.');
      }
      const payload = requireRecord(parsed.data ?? parsed, 'Backup data');
      const organisations = payload.organisations;
      const facilityRooms = payload.facilityRooms;
      if (!Array.isArray(organisations) && !Array.isArray(facilityRooms)) {
        throw new Error('This backup has no supported organizations or facility rooms.');
      }

      let organisationCount = 0;
      let roomCount = 0;
      if (Array.isArray(organisations)) {
        const existing = await appModel.organisationModel.getAllOrganisations();
        const existingNames = new Set(existing.map(item => item.organisation.name));
        for (const value of organisations) {
          const organisation = requireRecord(value, 'Organization');
          const name = typeof organisation.name === 'string' ? organisation.name.trim() : '';
          if (!name || existingNames.has(name)) continue;
          const description = typeof organisation.description === 'string'
            ? organisation.description
            : undefined;
          await appModel.organisationModel.createOrganisation(name, description);
          existingNames.add(name);
          organisationCount += 1;
        }
      }

      if (Array.isArray(facilityRooms)) {
        for (const value of facilityRooms) {
          const room = requireRecord(value, 'Facility room');
          const roomId = typeof room.roomId === 'string' ? room.roomId.trim() : '';
          const name = typeof room.name === 'string' ? room.name.trim() : '';
          if (!roomId || !name) continue;
          const requestedKind = typeof room.roomKind === 'string' ? room.roomKind : 'other';
          const roomKind = ROOM_KINDS.has(requestedKind) ? requestedKind : 'other';
          const legacyResources = Array.isArray(room.resources) ? room.resources : [];
          const explicitDeviceIds = Array.isArray(room.deviceIds) ? room.deviceIds : [];
          const deviceIds = [...explicitDeviceIds, ...legacyResources.map(resource => (
            resource && typeof resource === 'object' ? (resource as {deviceId?: unknown}).deviceId : undefined
          ))].filter((id): id is string => typeof id === 'string' && id.length > 0);
          const createdAt = typeof room.createdAt === 'number' ? room.createdAt : Date.now();
          await appModel.deviceControlModel.saveRoomConfiguration({
            roomId,
            name,
            roomKind: roomKind as 'treatment-room' | 'bathroom' | 'operating-room' | 'laboratory' | 'other',
            deviceIds,
            createdAt,
            updatedAt: Date.now(),
          });
          roomCount += 1;
        }
      }

      Alert.alert(
        'Import complete',
        `Restored ${organisationCount} organization(s) and ${roomCount} facility room(s). Other backup sections were not imported.`,
      );
    } catch (error) {
      console.error('[DataManagement] Import failed:', error);
      Alert.alert('Import failed', messageFromError(error));
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('settings.dataManagement.title', {defaultValue: 'Data'}),
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={styles.backButton}
            />
          ),
        }}
      />
      <ScrollView
        style={[styles.container, {backgroundColor: theme.colors.background}]}
        contentContainerStyle={styles.content}
      >
        <Surface style={[styles.section, {backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant}]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="file-excel-outline" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.sectionHeaderText}>Export Excel workbook</Text>
          </View>
          <Text style={[styles.description, {color: theme.colors.onSurfaceVariant}]}>
            Export the stored organization, room, and treatment records available to this instance,
            plus the current discovered-device snapshot. Credentials and internal settings are excluded.
          </Text>
          <Button
            mode="contained"
            onPress={handleExport}
            style={styles.button}
            icon="file-excel-outline"
            loading={exporting}
            disabled={exporting || importing}
          >
            Export .xlsx
          </Button>
        </Surface>

        <Surface style={[styles.section, {backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant}]}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="database-import-outline" size={24} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.sectionHeaderText}>Import prior JSON backup</Text>
          </View>
          <Text style={[styles.description, {color: theme.colors.onSurfaceVariant}]}>
            Accepts a UVC JSON backup from an earlier app version. Import restores new organizations
            and facility rooms only. It does not restore devices, departments, treatment runs, credentials, or settings.
          </Text>
          <Button
            mode="outlined"
            onPress={handleImport}
            style={styles.button}
            icon="database-import-outline"
            loading={importing}
            disabled={exporting || importing}
          >
            Choose JSON backup
          </Button>
        </Surface>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  content: {padding: 16, paddingBottom: 32},
  section: {
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  sectionHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 12},
  sectionHeaderText: {marginLeft: 8},
  description: {marginBottom: 16, lineHeight: 21},
  button: {marginTop: 8},
  backButton: {marginLeft: -4},
});
