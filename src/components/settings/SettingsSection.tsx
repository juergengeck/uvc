import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Switch 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SettingsSwitchEntryProps {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

interface SettingsNavigationEntryProps {
  title: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
}

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

/**
 * Settings entry with a switch control
 */
export const SettingsSwitchEntry: React.FC<SettingsSwitchEntryProps> = ({
  title,
  description,
  value,
  onValueChange,
  disabled = false
}) => {
  return (
    <View style={styles.entryContainer}>
      <View style={styles.entryContent}>
        <Text style={styles.entryTitle}>{title}</Text>
        {description && <Text style={styles.entryDescription}>{description}</Text>}
      </View>
      <Switch 
        value={value} 
        onValueChange={onValueChange} 
        disabled={disabled}
      />
    </View>
  );
};

/**
 * Settings entry with navigation to another screen
 */
export const SettingsNavigationEntry: React.FC<SettingsNavigationEntryProps> = ({
  title,
  description,
  onPress,
  disabled = false
}) => {
  return (
    <TouchableOpacity 
      style={styles.entryContainer} 
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.entryContent}>
        <Text style={styles.entryTitle}>{title}</Text>
        {description && <Text style={styles.entryDescription}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={24} color="#757575" />
    </TouchableOpacity>
  );
};

/**
 * Settings section with a title and children
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  children
}) => {
  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196f3',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  sectionContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  entryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  entryContent: {
    flex: 1,
    paddingRight: 16,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  entryDescription: {
    fontSize: 14,
    color: '#757575',
    marginTop: 2,
  },
});

export default {
  SettingsSection,
  SettingsSwitchEntry,
  SettingsNavigationEntry
}; 