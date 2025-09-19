import React, { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  Surface,
  Text,
  Searchbar,
  List,
  Avatar,
  Button,
  IconButton,
  Divider,
  ActivityIndicator,
  Checkbox,
  Appbar,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { useInstance } from '@src/providers/app';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

interface Contact {
  id: SHA256IdHash<Person>;
  displayName: string;
  profileIdHash?: string;
  isAI?: boolean;
}

interface ContactPickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (contacts: Contact[]) => void;
  multiSelect?: boolean;
  excludeIds?: string[];
  title?: string;
}

export const ContactPicker: React.FC<ContactPickerProps> = ({
  visible,
  onDismiss,
  onSelect,
  multiSelect = false,
  excludeIds = [],
  title,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { models } = useInstance();
  const leuteModel = models?.leuteModel;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load contacts
  useEffect(() => {
    if (visible && leuteModel) {
      loadContacts();
    }
  }, [visible, leuteModel]);

  // Filter contacts based on search
  useEffect(() => {
    if (searchQuery) {
      const filtered = contacts.filter(contact =>
        contact.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchQuery, contacts]);

  const loadContacts = async () => {
    if (!leuteModel) {
      console.error('[ContactPicker] LeuteModel not available');
      return;
    }

    try {
      setIsLoading(true);
      console.log('[ContactPicker] Loading contacts...');
      const allContacts: Contact[] = [];

      // Get all someone else contacts
      const someoneElseList = await leuteModel.others();
      console.log('[ContactPicker] Found contacts:', someoneElseList.length);
      console.log('[ContactPicker] First contact:', someoneElseList[0]);
      
      for (const someone of someoneElseList) {
        console.log('[ContactPicker] Processing contact:', someone);
        const personId = someone.personId || someone.personIdHash || someone.id;
        if (personId && !excludeIds.includes(personId)) {
          allContacts.push({
            id: personId,
            displayName: someone.displayName || someone.name || 'Unknown',
            profileIdHash: someone.profileIdHash || someone.profileId,
            isAI: false,
          });
        }
      }

      // Sort by display name
      allContacts.sort((a, b) => a.displayName.localeCompare(b.displayName));
      
      console.log('[ContactPicker] Total contacts loaded:', allContacts.length);
      console.log('[ContactPicker] Exclude IDs:', excludeIds);
      console.log('[ContactPicker] Final contacts:', allContacts);
      
      setContacts(allContacts);
      setFilteredContacts(allContacts);
    } catch (error) {
      console.error('[ContactPicker] Error loading contacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleContactSelection = (contactId: string) => {
    if (multiSelect) {
      const newSelection = new Set(selectedContacts);
      if (newSelection.has(contactId)) {
        newSelection.delete(contactId);
      } else {
        newSelection.add(contactId);
      }
      setSelectedContacts(newSelection);
    } else {
      // Single select - immediately return the selected contact
      const contact = contacts.find(c => c.id === contactId);
      if (contact) {
        onSelect([contact]);
        onDismiss();
      }
    }
  };

  const handleConfirm = () => {
    const selected = contacts.filter(c => selectedContacts.has(c.id));
    onSelect(selected);
    onDismiss();
  };

  const getAvatarLabel = (name: string) => {
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const renderContact = ({ item }: { item: Contact }) => (
    <List.Item
      title={item.displayName}
      description={item.isAI ? 'AI Assistant' : undefined}
      onPress={() => toggleContactSelection(item.id)}
      left={(props) => (
        <Avatar.Text
          {...props}
          label={getAvatarLabel(item.displayName)}
          size={40}
          style={{ backgroundColor: theme.colors.primaryContainer }}
        />
      )}
      right={(props) =>
        multiSelect ? (
          <Checkbox
            {...props}
            status={selectedContacts.has(item.id) ? 'checked' : 'unchecked'}
            onPress={() => toggleContactSelection(item.id)}
          />
        ) : null
      }
      style={styles.contactItem}
    />
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      onRequestClose={onDismiss}
      animationType="slide"
      presentationStyle="pageSheet"
      onDismiss={onDismiss}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          <Appbar.Content title={title || t('chat:selectContact')} />
          <Appbar.Action icon="close" onPress={onDismiss} />
        </Appbar.Header>

        <Surface style={[styles.content, { backgroundColor: theme.colors.background }]} elevation={0}>
          <Searchbar
            placeholder={t('common:search')}
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchBar}
            icon="magnify"
            clearIcon="close"
          />

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>{t('common:loading')}</Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              renderItem={renderContact}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <Divider />}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {searchQuery
                      ? t('contacts:noResults')
                      : t('contacts:noContacts')}
                  </Text>
                </View>
              }
            />
          )}

          {multiSelect && selectedContacts.size > 0 && (
            <Surface style={[styles.footer, { backgroundColor: theme.colors.surface }]} elevation={2}>
              <Text style={styles.selectionCount}>
                {t('chat:selectedParticipants')}: {selectedContacts.size}
              </Text>
              <Button
                mode="contained"
                onPress={handleConfirm}
                style={styles.confirmButton}
              >
                {t('common:confirm')}
              </Button>
            </Surface>
          )}
        </Surface>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  searchBar: {
    margin: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 100,
  },
  contactItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 64,
  },
  emptyText: {
    opacity: 0.7,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCount: {
    flex: 1,
    marginRight: 16,
  },
  confirmButton: {
    minWidth: 120,
  },
});