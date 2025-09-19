/**
 * Calendar Screen
 * 
 * Displays and manages user calendar.
 * Shows journal entries in a calendar view.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { useInstance } from '@src/providers/app';
import { useTranslation } from 'react-i18next';
import { useRouter, Stack } from 'expo-router';
import { Calendar, type DateData } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';
import type { JournalEntry } from '@OneObjectInterfaces';
import { ActionButton } from '@src/components/common/ActionButton';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { Namespaces } from '@src/i18n/namespaces';

export default function CalendarScreen() {
  const { instance, isAuthenticated } = useInstance();
  const { t } = useTranslation('calendar');
  const { t: tJournal } = useTranslation(Namespaces.JOURNAL);
  const tCommon = useTranslation('common').t;
  const theme = useTheme();
  const { styles: themedStyles } = useAppTheme();
  const router = useRouter();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});

  // Load journal data function
  const loadJournalData = useCallback(async () => {
    try {
      if (!instance?.journalModel?.retrieveLatestDayEvents) {
        console.log('[CalendarScreen] Journal model or retrieveLatestDayEvents not available');
        return;
      }

      console.log('[CalendarScreen] Loading journal data');
      
      // Fetch the latest journal entries
      const latestEvents = await instance.journalModel.retrieveLatestDayEvents();
      console.log('[CalendarScreen] Retrieved latest journal events:', latestEvents?.length || 0);
      
      // Handle empty case gracefully
      if (!latestEvents || !latestEvents.length) {
        console.log('[CalendarScreen] No journal entries found');
        setEntries([]);
        return;
      }
      
      // Convert to the expected format and update state
      const journalEntries = latestEvents.map(event => {
        // Safely handle the timestamp using creationTime
        let timestamp: number;
        try {
          // Access the timestamp via event.data.creationTime
          const eventCreationTime = (event as any)?.data?.creationTime;
          
          if (eventCreationTime) {
            // Handle string or Date objects for creationTime
            timestamp = typeof eventCreationTime === 'string' 
              ? new Date(eventCreationTime).getTime() 
              : eventCreationTime instanceof Date 
                ? eventCreationTime.getTime() 
                : typeof eventCreationTime === 'number' // Also handle if it's already a number
                  ? eventCreationTime
                  : Date.now(); // Fallback if type is unexpected
          } else {
            // Fallback if creationTime is missing
            console.warn('[CalendarScreen] Missing creationTime in event data, using current time.');
            timestamp = Date.now();
          }
        } catch (err) {
          console.warn('[CalendarScreen] Error processing creationTime:', err);
          timestamp = Date.now(); // Fallback on error
        }

        const entry: JournalEntry = {
          id: (event as any).id || `entry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          timestamp, // Keep the processed numeric timestamp
          data: (event as any).data || event, // Keep the original data object
          $type$: 'JournalEntry',
          type: (event as any).type || 'unknown' // Use the type from the event itself
        };
        return entry;
      });
      
      setEntries(journalEntries);
    } catch (error) {
      console.error('[CalendarScreen] Error loading journal data:', error);
    }
  }, [instance?.journalModel]);

  useEffect(() => {
    if (!instance?.journalModel) return;

    // Set up event listener for updates - simplified to match journal implementation
    const unsubscribeFunction = instance.journalModel.onUpdated.listen(function() {
      console.log('[CalendarScreen] Journal update event received');
      loadJournalData();
    });

    // Load initial data
    loadJournalData();

    return () => {
      if (typeof unsubscribeFunction === 'function') {
        unsubscribeFunction();
      }
    };
  }, [instance?.journalModel, loadJournalData]);

  useEffect(() => {
    // Update marked dates when entries change
    const marked: MarkedDates = {};
    entries.forEach(entry => {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      marked[date] = {
        marked: true,
        dotColor: theme.colors.primary
      };
    });
    
    // Highlight selected date
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: theme.colors.primary
      };
    }
    
    setMarkedDates(marked);
  }, [entries, selectedDate, theme.colors.primary]);

  const onDayPress = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
  }, []);

  const handleAddEntry = useCallback(() => {
    // Add entry functionality - same as journal view
    const newEntry = {
      id: `entry-${Date.now()}`,
      timestamp: Date.now(),
      data: { text: `Entry at ${new Date().toLocaleString()}` },
      $type$: 'JournalEntry',
      type: 'note'
    } as JournalEntry;
    
    setEntries(current => [...current, newEntry].sort((a, b) => b.timestamp - a.timestamp));
  }, []);

  const selectedEntries = entries.filter(entry => {
    const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
    return entryDate === selectedDate;
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen 
        options={{ 
          headerShown: false, // Hide the default header
        }} 
      />
      
      {/* Custom header that matches the Journal tab */}
      <View style={[styles.customHeader, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.customTitle, { color: theme.colors.onBackground }]}>
          {t('title', { defaultValue: 'Kalender' })}
        </Text>
        <View style={styles.headerRight}>
          <IconButton
            icon="home"
            size={24}
            iconColor={theme.colors.primary}
            onPress={() => router.push('/(tabs)/')}
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
        <View style={styles.entriesContainer}>
          {/* Add Entry button - positioned at top like in Journal */}
          <ActionButton
            title={tJournal('addEntry', { defaultValue: 'Eintrag hinzufügen' })}
            onPress={handleAddEntry}
            style={styles.addButton}
          />
          
          {/* Scrollable entries area */}
          <ScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {selectedEntries.length > 0 ? (
              selectedEntries.map(entry => (
                <View 
                  key={entry.id} 
                  style={[styles.entryCard, { backgroundColor: theme.colors.surfaceVariant }]}
                >
                  <Text style={[styles.entryTime, { color: theme.colors.onSurfaceVariant }]}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </Text>
                  <Text style={[styles.entryData, { color: theme.colors.onSurfaceVariant }]}>
                    {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.noEntries, { color: theme.colors.onSurfaceVariant }]}>
                {t('noEntries', { defaultValue: 'Keine Einträge für dieses Datum' })}
              </Text>
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
  entriesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  entryCard: {
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  entryTime: {
    fontSize: 12,
    marginBottom: 4,
  },
  entryData: {
    fontSize: 14,
  },
  noEntries: {
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
  addButton: {
    marginTop: 16,
    marginBottom: 16,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 120,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 50,
  },
  customTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'left',
    marginTop: 0,
    marginLeft: 8,
  },
  headerRight: {
    flexDirection: 'row',
    marginRight: -8,
    marginTop: 12,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
}); 