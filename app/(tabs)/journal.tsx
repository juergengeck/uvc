import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Menu, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import type {UvcDisinfectionRun, UvcRoom} from '@refinio/uvc.core';

import ErrorView from '@src/components/ErrorView';
import { LoadingSpinner } from '@src/components/LoadingSpinner';
import { routes } from '@src/config/routes';
import { Namespaces } from '@src/i18n/namespaces';
import { useInstance } from '@src/providers/app';
import {
  type UvcJournalRecord,
  uvcDisinfectionRunRecords,
  uvcJournalRecords,
} from '@src/utils/uvcJournal';

function statusIcon(status: UvcJournalRecord['status']): string {
  switch (status) {
    case 'completed': return 'check-circle-outline';
    case 'planned': return 'clock-outline';
    case 'running': return 'progress-clock';
    case 'failed': return 'alert-circle-outline';
    case 'device': return 'access-point';
    default: return 'notebook-outline';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function JournalScreen() {
  const { instance, isAuthenticated } = useInstance();
  const { t: tJournal } = useTranslation(Namespaces.JOURNAL);
  const { t: tNav } = useTranslation(Namespaces.NAVIGATION);
  const theme = useTheme();
  const router = useRouter();

  const [records, setRecords] = useState<UvcJournalRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [modelState, setModelState] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [rooms, setRooms] = useState<UvcRoom[]>([]);
  const [activeRun, setActiveRun] = useState<UvcDisinfectionRun | null>(null);
  const [roomMenuVisible, setRoomMenuVisible] = useState(false);
  const [treatmentBusy, setTreatmentBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !instance) {
      router.replace(routes.auth.login);
    }
  }, [instance, isAuthenticated, router]);

  const handleError = useCallback((caughtError: unknown) => {
    const nextError = caughtError instanceof Error ? caughtError : new Error(String(caughtError));
    console.error('[JournalScreen] Error:', nextError);
    setError(nextError);
    setModelState('error');
  }, []);

  const loadJournalData = useCallback(async () => {
    if (!instance?.journalModel?.retrieveLatestDayEvents) return;

    setIsLoadingEntries(true);
    try {
      const [disinfectionRuns, configuredRooms] = await Promise.all([
        instance.deviceControlModel?.getDisinfectionRunRecords(),
        instance.deviceControlModel?.getRooms(),
      ]);
      setRooms(configuredRooms ?? []);
      setActiveRun(disinfectionRuns?.find(record => record.run.status === 'running')?.run ?? null);
      if (disinfectionRuns?.length) {
        setRecords(uvcDisinfectionRunRecords(disinfectionRuns));
        return;
      }
      const latestEvents = await instance.journalModel.retrieveLatestDayEvents();
      setRecords(uvcJournalRecords(latestEvents));
    } catch (caughtError) {
      handleError(caughtError);
    } finally {
      setIsLoadingEntries(false);
    }
  }, [handleError, instance?.deviceControlModel, instance?.journalModel]);

  const startTreatment = useCallback((room: UvcRoom) => {
    setRoomMenuVisible(false);
    Alert.alert(
      tJournal('startConfirmTitle'),
      tJournal('startConfirmDescription', {room: room.name}),
      [
        {text: tJournal('cancel'), style: 'cancel'},
        {
          text: tJournal('start'),
          onPress: () => {
            setTreatmentBusy(true);
            void instance?.deviceControlModel?.startRoomTreatment({roomId: room.roomId})
              .catch(caughtError => Alert.alert(tJournal('startFailed'), errorMessage(caughtError)))
              .finally(() => setTreatmentBusy(false));
          },
        },
      ],
    );
  }, [instance?.deviceControlModel, tJournal]);

  const stopTreatment = useCallback(() => {
    if (!activeRun) return;
    Alert.alert(
      tJournal('stopConfirmTitle'),
      tJournal('stopConfirmDescription', {room: activeRun.roomName}),
      [
        {text: tJournal('cancel'), style: 'cancel'},
        {
          text: tJournal('stop'),
          style: 'destructive',
          onPress: () => {
            setTreatmentBusy(true);
            void instance?.deviceControlModel?.stopRoomTreatment({runId: activeRun.runId})
              .catch(caughtError => Alert.alert(tJournal('stopFailed'), errorMessage(caughtError)))
              .finally(() => setTreatmentBusy(false));
          },
        },
      ],
    );
  }, [activeRun, instance?.deviceControlModel, tJournal]);

  useEffect(() => {
    const journalModel = instance?.journalModel;
    if (!journalModel) return;

    let disconnect: (() => void) | undefined;
    let disconnectFacility: (() => void) | undefined;
    let checkInterval: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      setModelState('ready');
      disconnect = journalModel.onUpdated.listen(() => {
        void loadJournalData();
      });
      disconnectFacility = instance.deviceControlModel?.onFacilityUpdated.listen(() => {
        void loadJournalData();
      }) as unknown as (() => void) | undefined;
      void loadJournalData();
    };

    if (journalModel.state?.currentState === 'Initialised') {
      connect();
    } else {
      checkInterval = setInterval(() => {
        if (journalModel.state?.currentState === 'Initialised') {
          if (checkInterval) clearInterval(checkInterval);
          connect();
        }
      }, 500);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      disconnect?.();
      disconnectFacility?.();
    };
  }, [instance?.deviceControlModel, instance?.journalModel, loadJournalData]);

  const renderItem = useCallback(({ item }: { item: UvcJournalRecord }) => (
    <Card mode="outlined" style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Card.Content>
        <View style={styles.cardHeading}>
          <View style={styles.cardTitleBlock}>
            <Text variant="titleMedium">{item.location}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.summary}
            </Text>
          </View>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Chip compact icon={statusIcon(item.status)}>
            {tJournal(`status.${item.status}`)}
          </Chip>
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {new Date(item.timestamp).toLocaleDateString()}
            </Text>
          </View>
          {item.durationMinutes ? (
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="timer-outline" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {item.durationMinutes} min
              </Text>
            </View>
          ) : null}
          {item.evidenceCount ? (
            <Chip compact icon="shield-check-outline">
              {tJournal('verifiedEvidence', {count: item.evidenceCount})}
            </Chip>
          ) : null}
        </View>

        {item.resources.length ? (
          <View style={styles.resourceRow}>
            <MaterialCommunityIcons name="access-point" size={17} color={theme.colors.primary} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
              {item.resources.join(' · ')}
            </Text>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  ), [tJournal, theme.colors.onSurfaceVariant, theme.colors.primary, theme.colors.surface]);

  if (!isAuthenticated || !instance || modelState === 'initializing') {
    return (
      <View style={[styles.centerContent, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: tNav('tabs.journal', { defaultValue: 'UVC cycle journal' }) }} />
        <LoadingSpinner
          message={tJournal('loading', { defaultValue: 'Loading journal' })}
          subtitle={tJournal('loadingSubtitle')}
          size="large"
        />
      </View>
    );
  }

  if (modelState === 'error' && error) {
    return <ErrorView error={error} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: tNav('tabs.journal', { defaultValue: 'UVC cycle journal' }) }} />

      <View style={styles.intro}>
        <Text variant="headlineSmall">{tJournal('headline')}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {tJournal('description')}
        </Text>
        <Button
          compact
          icon="devices"
          mode="outlined"
          onPress={() => router.push('/(screens)/devices')}
          style={styles.devicesButton}
        >
          {tJournal('devices')}
        </Button>
        <View style={styles.treatmentActions}>
          {activeRun ? (
            <Button
              icon="stop-circle-outline"
              loading={treatmentBusy}
              mode="contained"
              onPress={stopTreatment}
              buttonColor={theme.colors.error}
            >
              {tJournal('stop')}
            </Button>
          ) : (
            <Menu
              visible={roomMenuVisible}
              onDismiss={() => setRoomMenuVisible(false)}
              anchor={(
                <Button
                  icon="play-circle-outline"
                  loading={treatmentBusy}
                  mode="contained"
                  onPress={() => setRoomMenuVisible(true)}
                >
                  {tJournal('start')}
                </Button>
              )}
            >
              {rooms.length ? rooms.map(room => (
                <Menu.Item
                  key={`${room.ownerPersonId}:${room.roomId}`}
                  leadingIcon="door"
                  onPress={() => startTreatment(room)}
                  title={room.name}
                />
              )) : (
                <Menu.Item disabled title={tJournal('noRooms')} />
              )}
            </Menu>
          )}
        </View>
      </View>

      {activeRun ? (
        <View style={[styles.activeNotice, { backgroundColor: theme.colors.primaryContainer }]}>
          <MaterialCommunityIcons name="radiobox-marked" size={21} color={theme.colors.onPrimaryContainer} />
          <View style={styles.activeNoticeText}>
            <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer }}>
              {tJournal('activeTitle')}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
              {tJournal('activeDescription', {
                room: activeRun.roomName,
                time: new Date(activeRun.startedAt!).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'}),
              })}
            </Text>
          </View>
        </View>
      ) : null}

      {isLoadingEntries ? (
        <View style={styles.centerContent}>
          <LoadingSpinner message={tJournal('refreshing')} size="large" />
        </View>
      ) : records.length ? (
        <FlatList
          data={records}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="calendar-check-outline" size={42} color={theme.colors.onSurfaceVariant} />
          <Text>{tJournal('noEntries', { defaultValue: 'No UVC cycle records yet' })}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  intro: {
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  devicesButton: {
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  treatmentActions: {
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  activeNotice: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
  },
  activeNoticeText: {
    flex: 1,
    gap: 2,
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
  cardHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  cardTitleBlock: {
    flex: 1,
    gap: 3,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  resourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
  centerContent: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 20,
  },
});
