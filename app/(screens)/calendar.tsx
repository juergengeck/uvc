import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, IconButton, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Calendar, type DateData } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';

import { useInstance } from '@src/providers/app';
import {
  localDateKey,
  type UvcJournalRecord,
  uvcDisinfectionRunRecords,
  uvcJournalRecords,
} from '@src/utils/uvcJournal';

export default function CalendarScreen() {
  const { instance } = useInstance();
  const { t } = useTranslation('calendar');
  const { t: tJournal } = useTranslation('journal');
  const theme = useTheme();
  const router = useRouter();

  const [records, setRecords] = useState<UvcJournalRecord[]>([]);
  const [showingDemo, setShowingDemo] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(Date.now()));

  const loadJournalData = useCallback(async () => {
    if (!instance?.journalModel?.retrieveLatestDayEvents) return;
    try {
      const disinfectionRuns = await instance.deviceControlModel?.getDisinfectionRunRecords();
      if (disinfectionRuns?.length) {
        setRecords(uvcDisinfectionRunRecords(disinfectionRuns));
        setShowingDemo(false);
        return;
      }
      const latestEvents = await instance.journalModel.retrieveLatestDayEvents();
      const next = uvcJournalRecords(latestEvents);
      setRecords(next.records);
      setShowingDemo(next.showingDemo);
    } catch (error) {
      console.error('[CalendarScreen] Error loading journal data:', error);
    }
  }, [instance?.deviceControlModel, instance?.journalModel]);

  useEffect(() => {
    const journalModel = instance?.journalModel;
    if (!journalModel) return;

    const disconnect = journalModel.onUpdated.listen(() => {
      void loadJournalData();
    });
    const disconnectFacility = instance.deviceControlModel?.onFacilityUpdated.listen(() => {
      void loadJournalData();
    }) as unknown as (() => void) | undefined;
    void loadJournalData();

    return () => {
      disconnect?.();
      disconnectFacility?.();
    };
  }, [instance?.deviceControlModel, instance?.journalModel, loadJournalData]);

  const markedDates = useMemo<MarkedDates>(() => {
    const marked: MarkedDates = {};
    records.forEach(record => {
      const date = localDateKey(record.timestamp);
      marked[date] = { marked: true, dotColor: theme.colors.primary };
    });
    marked[selectedDate] = {
      ...marked[selectedDate],
      selected: true,
      selectedColor: theme.colors.primary,
    };
    return marked;
  }, [records, selectedDate, theme.colors.primary]);

  const selectedEntries = useMemo(() => (
    records.filter(record => localDateKey(record.timestamp) === selectedDate)
  ), [records, selectedDate]);

  const onDayPress = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.customHeader, { backgroundColor: theme.colors.background }]}>
        <View style={styles.titleBlock}>
          <Text style={[styles.customTitle, { color: theme.colors.onBackground }]}>
            {t('title', { defaultValue: 'Disinfection calendar' })}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('description')}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton
            icon="cog"
            size={24}
            iconColor={theme.colors.primary}
            onPress={() => router.push('/(screens)/settings')}
            style={{ margin: 0, marginRight: 8 }}
          />
          <IconButton
            icon="notebook"
            size={24}
            iconColor={theme.colors.primary}
            onPress={() => router.push('/(tabs)/journal')}
            style={{ margin: 0 }}
          />
        </View>
      </View>

      <View style={styles.content}>
        <Calendar
          theme={{
            calendarBackground: theme.colors.background,
            textSectionTitleColor: theme.colors.onBackground,
            selectedDayBackgroundColor: theme.colors.primary,
            selectedDayTextColor: theme.colors.onPrimary,
            todayTextColor: theme.colors.primary,
            dayTextColor: theme.colors.onBackground,
            textDisabledColor: theme.colors.onSurfaceDisabled,
            monthTextColor: theme.colors.onBackground,
            arrowColor: theme.colors.primary,
          }}
          markedDates={markedDates}
          onDayPress={onDayPress}
          enableSwipeMonths
        />

        {showingDemo ? (
          <View style={[styles.demoNotice, { backgroundColor: theme.colors.secondaryContainer }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={19} color={theme.colors.onSecondaryContainer} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer, flex: 1 }}>
              {t('demoDescription')}
            </Text>
          </View>
        ) : null}

        <View style={styles.entriesContainer}>
          <View style={styles.dayHeading}>
            <Text variant="titleMedium">
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                weekday: 'long',
              })}
            </Text>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('recordCount', { count: selectedEntries.length })}
            </Text>
          </View>

          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            {selectedEntries.length ? selectedEntries.map(entry => (
              <View
                key={entry.id}
                style={[styles.entryCard, { backgroundColor: theme.colors.surfaceVariant }]}
              >
                <View style={styles.entryHeading}>
                  <View style={styles.entryTitleBlock}>
                    <Text variant="titleMedium">{entry.location}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {entry.summary}
                    </Text>
                  </View>
                  <Text variant="labelLarge">
                    {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.entryMeta}>
                  <Chip compact>{tJournal(`status.${entry.status}`)}</Chip>
                  {entry.durationMinutes ? (
                    <View style={styles.metaItem}>
                      <MaterialCommunityIcons name="timer-outline" size={16} color={theme.colors.onSurfaceVariant} />
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {entry.durationMinutes} min
                      </Text>
                    </View>
                  ) : null}
                </View>

                {entry.resources.length ? (
                  <View style={styles.resourceRow}>
                    <MaterialCommunityIcons name="access-point" size={17} color={theme.colors.primary} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                      {entry.resources.join(' · ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            )) : (
              <View style={styles.noEntries}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={32} color={theme.colors.onSurfaceVariant} />
                <Text style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('noEntries', { defaultValue: 'No treatments recorded for this date' })}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 32,
  },
  content: {
    flex: 1,
  },
  customHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 120,
    paddingBottom: 14,
    paddingHorizontal: 16,
    paddingTop: 42,
  },
  titleBlock: {
    flex: 1,
    gap: 3,
  },
  customTitle: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    marginRight: -8,
    marginTop: 6,
  },
  demoNotice: {
    alignItems: 'center',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 9,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 11,
  },
  entriesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  dayHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingTop: 16,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  entryCard: {
    borderRadius: 10,
    marginBottom: 10,
    padding: 14,
  },
  entryHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  entryTitleBlock: {
    flex: 1,
    gap: 3,
  },
  entryMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 13,
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
    marginTop: 13,
  },
  noEntries: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    padding: 32,
  },
});
