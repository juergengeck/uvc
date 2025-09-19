import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { router } from 'expo-router';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import type { JournalEntry } from '@OneObjectInterfaces';
import { ActionButton } from '@src/components/common/ActionButton';

/**
 * Component for displaying recent journal entries in a collapsible card on the home screen
 */
export function JournalCard() {
  const [expanded, setExpanded] = useState(true);
  const theme = useTheme();
  const { styles: themedStyles } = useAppTheme();
  
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const handleEntryPress = (entryId: string) => {
    router.push(`/(screens)/journal`);
  };

  const handleAddEntry = () => {
    router.push(`/(tabs)/journal`);
  };

  return (
    <View style={themedStyles.collapsibleSection}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={themedStyles.collapsibleHeader}>
        <Text style={themedStyles.collapsibleHeaderText}>Recent Journal Entries</Text>
        <IconButton
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          onPress={() => setExpanded(!expanded)}
          size={20}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={themedStyles.collapsibleContent}>
          {entries.length === 0 ? (
            <ActionButton
              title="Add Entry"
              onPress={handleAddEntry}
            />
          ) : (
            <View>
              {entries.slice(0, 5).map((entry: JournalEntry) => (
                <TouchableOpacity
                  key={entry.id}
                  onPress={() => handleEntryPress(entry.id)}
                  style={styles.entryItem}
                >
                  <View style={styles.entryContent}>
                    <Text style={themedStyles.itemTitle}>
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </Text>
                    <Text style={themedStyles.itemDescription} numberOfLines={2} ellipsizeMode="tail">
                      {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}
                    </Text>
                  </View>
                  <View style={styles.rightContent}>
                    <Text style={styles.timestamp}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </Text>
                    <IconButton icon="chevron-right" size={20} />
                  </View>
                </TouchableOpacity>
              ))}
              <ActionButton
                title="Add Entry"
                onPress={handleAddEntry}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.29)',
  },
  entryContent: {
    flex: 1,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestamp: {
    opacity: 0.6,
    marginRight: 8,
    fontSize: 13,
  },
}); 