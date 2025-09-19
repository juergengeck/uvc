/**
 * Someone Contact List Component
 * 
 * Displays contacts using LeuteModel directly following one.leute patterns
 */

import React, { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Text, useTheme, Surface, Divider } from 'react-native-paper';
import { useAppModel } from '@src/hooks/useAppModel';

interface Contact {
  someoneId: string;
  displayName: string;
  someone: any;
}

interface SomeoneContactListProps {
  filter?: 'all' | 'online' | 'offline';
  searchQuery?: string;
  onSomeoneSelected?: (someone: any) => void;
}

export function SomeoneContactList({ 
  filter = 'all', 
  searchQuery = '', 
  onSomeoneSelected 
}: SomeoneContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { appModel } = useAppModel();
  const theme = useTheme();

  const loadContacts = async () => {
    if (!appModel?.leuteModel) {
      console.log('[SomeoneContactList] AppModel or LeuteModel not available');
      setError('LeuteModel not available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[SomeoneContactList] Loading contacts...');
      
      // Debug: Check LeuteModel state
      const leuteModel = appModel.leuteModel;
      console.log('[SomeoneContactList] LeuteModel state:', leuteModel.state?.currentState);
      console.log('[SomeoneContactList] LeuteModel initialized:', leuteModel.leute !== undefined);
      
      // Debug: Check raw leute.other array
      if (leuteModel.leute) {
        console.log('[SomeoneContactList] Raw leute.other array:', leuteModel.leute.other);
        console.log('[SomeoneContactList] leute.other length:', leuteModel.leute.other.length);
      } else {
        console.log('[SomeoneContactList] leute object is undefined');
      }

      const allContacts = await leuteModel.others();
      console.log('[SomeoneContactList] leuteModel.others() returned:', allContacts);
      console.log('[SomeoneContactList] Number of contacts from others():', allContacts?.length || 0);

      if (!allContacts || allContacts.length === 0) {
        console.log('[SomeoneContactList] No contacts found');
        setContacts([]);
        return;
      }

      // Transform contacts to our format
      const transformedContacts: Contact[] = [];
      
      for (const someoneModel of allContacts) {
        try {
          console.log('[SomeoneContactList] Processing contact:', someoneModel);
          console.log('[SomeoneContactList] Contact idHash:', someoneModel.idHash);
          console.log('[SomeoneContactList] Contact hasData:', someoneModel.hasData());
          
          // allContacts from leuteModel.others() already contains SomeoneModel objects
          if (!someoneModel) {
            console.log('[SomeoneContactList] Invalid Someone object:', someoneModel);
            continue;
          }

          // Get profile from Someone
          const profile = await someoneModel.mainProfile();
          if (!profile) {
            console.log('[SomeoneContactList] No profile found for Someone:', someoneModel.idHash);
            continue;
          }

          console.log('[SomeoneContactList] Profile found:', profile.idHash);
          console.log('[SomeoneContactList] Profile name:', profile.name);

          // Get the Someone ID - use the someoneModel's idHash directly
          const someoneId = someoneModel.idHash || 'unknown';
          
          // Get the person ID from the SomeoneModel for the contact selection handler
          const personId = await someoneModel.mainIdentity();
          console.log('[SomeoneContactList] Person ID:', personId);
          
          // Create contact entry - use profile.name, not displayName
          const contactEntry: Contact = {
            someoneId: someoneId,
            displayName: profile.name || `Contact ${someoneId.substring(0, 8)}`,
            someone: {
              ...someoneModel,
              personId: personId // Add personId property for the contact selection handler
            }
          };

          transformedContacts.push(contactEntry);
          console.log('[SomeoneContactList] Added contact:', contactEntry.displayName);
          
        } catch (contactError) {
          console.warn('[SomeoneContactList] Failed to process contact:', contactError);
          continue;
        }
      }

      // Apply search filter
      let filteredContacts = transformedContacts;
      if (searchQuery) {
        filteredContacts = transformedContacts.filter(contact =>
          contact.displayName.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      console.log('[SomeoneContactList] Final contacts:', filteredContacts.length);
      setContacts(filteredContacts);
      
    } catch (error) {
      console.error('[SomeoneContactList] Error loading contacts:', error);
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  // Load contacts when component mounts or appModel changes
  useEffect(() => {
    loadContacts();
  }, [appModel]);

  // Reload when search query changes
  useEffect(() => {
    if (!loading) {
      loadContacts();
    }
  }, [searchQuery]);

  const renderContact = ({ item }: { item: Contact }) => (
    <Surface style={[styles.contactItem, { backgroundColor: theme.colors.surface }]}>
      <TouchableOpacity
        style={styles.contactTouchable}
        onPress={() => onSomeoneSelected?.(item.someone)}
      >
        <View style={styles.contactInfo}>
          <Text 
            variant="bodyLarge" 
            style={[styles.contactName, { color: theme.colors.onSurface }]}
          >
            {item.displayName}
          </Text>
          <Text 
            variant="bodySmall" 
            style={[styles.contactId, { color: theme.colors.onSurfaceVariant }]}
          >
            {item.someoneId ? `${item.someoneId.substring(0, 16)}...` : 'No ID'}
          </Text>
        </View>
      </TouchableOpacity>
    </Surface>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text 
          variant="bodyLarge" 
          style={[styles.statusText, { color: theme.colors.onSurfaceVariant }]}
        >
          Loading contacts...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text 
          variant="bodyLarge" 
          style={[styles.errorText, { color: theme.colors.error }]}
        >
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {contacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text 
            variant="bodyLarge" 
            style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
          >
            {searchQuery ? 'No contacts match your search' : 'No contacts found'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          renderItem={renderContact}
          keyExtractor={(item) => item.someoneId}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <Divider style={{ backgroundColor: theme.colors.outline }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 16,
  },
  contactItem: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    elevation: 1,
  },
  contactTouchable: {
    padding: 16,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  contactId: {
    fontSize: 12,
  },
  statusText: {
    textAlign: 'center',
    marginTop: 50,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 50,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    textAlign: 'center',
  },
}); 