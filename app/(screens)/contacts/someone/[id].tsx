/**
 * Someone Contact Details Screen
 * 
 * Displays contact details for a Someone object, following system-wide
 * design templates and proper i18n translations.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { Text, Button, Avatar, useTheme, Divider, IconButton, List, Card } from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import { SomeoneDisplayInfo } from '@src/types/someone';
import { useAppModel } from '@src/hooks/useAppModel';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';

interface ContactAction {
  type: 'email' | 'phone' | 'address';
  label: string;
  value: string;
  icon: string;
  onPress: () => void;
}

export default function SomeoneContactDetailsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation(Namespaces.CONTACTS);
  const { instance } = useInstance();
  const { appModel } = useAppModel();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [someoneInfo, setSomeoneInfo] = useState<SomeoneDisplayInfo | null>(null);
  const [actions, setActions] = useState<ContactAction[]>([]);

  // Load Someone information using LeuteModel directly
  const loadSomeoneInfo = useCallback(async () => {
    if (!appModel?.leuteModel || !id) {
      console.log('[SomeoneContactDetails] Missing LeuteModel or ID');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log(`[SomeoneContactDetails] Loading Someone info for ID: ${id}`);
      
      // Get Someone objects using LeuteModel.others()
      const someoneObjects = await appModel.leuteModel.others();
      const targetSomeone = someoneObjects.find(someone => someone.personId === id);
      
      if (!targetSomeone) {
        setError(t('details.errors.not_found'));
        return;
      }
      
      // Get the person's profile
      const personProfile = await appModel.leuteModel.getProfile(targetSomeone.personId as SHA256IdHash<Person>);
      
      if (!personProfile) {
        setError(t('details.errors.profile_not_found'));
        return;
      }
      
      // Create SomeoneDisplayInfo following the correct interface
      const displayInfo: SomeoneDisplayInfo = {
        someoneId: targetSomeone.idHash,
        personId: targetSomeone.personId,
        displayName: personProfile.name || 'Unknown',
        mainProfile: {
          profileId: personProfile.idHash,
          personDescriptions: personProfile.personDescriptions || [],
          communicationEndpoints: personProfile.communicationEndpoints || []
        },
        allProfiles: [{
          profileId: personProfile.idHash,
          personId: targetSomeone.personId,
          displayName: personProfile.name,
          description: personProfile.personDescriptions?.[0]?.description
        }],
        isAI: false, // TODO: Check if this is an AI assistant
        isCurrentUser: false // This is not the current user since it's from others()
      };
      
      setSomeoneInfo(displayInfo);
      
      // Build action items based on available information
      const actionList: ContactAction[] = [];
      
      // Email actions
      if (personProfile.communicationEndpoints) {
        for (const endpoint of personProfile.communicationEndpoints) {
          if (endpoint.$type$ === 'Email' && endpoint.address) {
            actionList.push({
              type: 'email',
              label: endpoint.address,
              value: endpoint.address,
              icon: 'email',
              onPress: () => Linking.openURL(`mailto:${endpoint.address}`)
            });
          }
        }
      }
      
      // Extract additional info from person descriptions
      if (personProfile.personDescriptions) {
        for (const desc of personProfile.personDescriptions) {
          if (desc.$type$ === 'PhoneNumber' && desc.number) {
            actionList.push({
              type: 'phone',
              label: `${desc.type || 'Phone'}: ${desc.number}`,
              value: desc.number,
              icon: 'phone',
              onPress: () => Linking.openURL(`tel:${desc.number}`)
            });
          } else if (desc.$type$ === 'PostalAddress' && desc.formatted) {
            actionList.push({
              type: 'address',
              label: `${desc.type || 'Address'}: ${desc.formatted}`,
              value: desc.formatted,
              icon: 'map-marker',
              onPress: () => {
                const encodedAddress = encodeURIComponent(desc.formatted);
                Linking.openURL(`https://maps.apple.com/?q=${encodedAddress}`);
              }
            });
          }
        }
      }
      
      setActions(actionList);
      console.log(`[SomeoneContactDetails] Loaded info for ${displayInfo.displayName}`);
      
    } catch (err) {
      console.error('[SomeoneContactDetails] Failed to load Someone info:', err);
      setError(err instanceof Error ? err.message : t('details.errors.loading'));
    } finally {
      setLoading(false);
    }
  }, [appModel?.leuteModel, id, t]);

  useEffect(() => {
    loadSomeoneInfo();
  }, [loadSomeoneInfo]);

  // Handle edit action
  const handleEdit = useCallback(() => {
    if (someoneInfo) {
      router.push(`/(screens)/contacts/someone/edit/${someoneInfo.someoneId}`);
    }
  }, [someoneInfo, router]);

  // Handle delete action
  const handleDelete = useCallback(async () => {
    if (!appModel?.leuteModel || !someoneInfo) return;
    
    console.log(`[SomeoneContactDetails] Delete requested for ${someoneInfo.displayName}`);
    // TODO: Implement delete functionality using LeuteModel
    router.back();
  }, [appModel?.leuteModel, someoneInfo, router]);

  // Handle connect action
  const handleConnect = useCallback(() => {
    if (someoneInfo) {
      console.log(`[SomeoneContactDetails] Connect requested for ${someoneInfo.displayName}`);
      // TODO: Implement connection functionality
    }
  }, [someoneInfo]);

  // Render loading state using system template
  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: t('details.loading_title') }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="bodyLarge" style={[styles.statusText, { color: theme.colors.onBackground }]}>
          {t('details.loading')}
        </Text>
      </View>
    );
  }

  // Render error state using system template
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ 
          title: t('details.error_title'),
          headerBackTitle: t('common:actions.back') 
        }} />
        
        <Card style={[styles.errorCard, { backgroundColor: theme.colors.errorContainer }]}>
          <Card.Content style={styles.centered}>
            <Text variant="headlineSmall" style={[styles.errorTitle, { color: theme.colors.onErrorContainer }]}>
              {t('details.error')}
            </Text>
            <Text variant="bodyLarge" style={[styles.errorMessage, { color: theme.colors.onErrorContainer }]}>
              {error}
            </Text>
            <Button 
              mode="contained" 
              onPress={() => router.back()}
              style={styles.actionButton}
            >
              {t('common:actions.back')}
            </Button>
          </Card.Content>
        </Card>
      </View>
    );
  }

  if (!someoneInfo) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: t('details.not_found_title') }} />
        <Text variant="headlineSmall">{t('details.not_found')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen 
        options={{ 
          title: someoneInfo.displayName,
          headerBackTitle: t('common:actions.back'),
        }} 
      />
      
      {/* Profile Header */}
      <Card style={styles.profileCard}>
        <Card.Content style={styles.profileHeader}>
          <Avatar.Text 
            size={80} 
            label={someoneInfo.displayName ? someoneInfo.displayName.substring(0, 2).toUpperCase() : '?'} 
            style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
          />
          <Text variant="headlineMedium" style={styles.nameText}>
            {someoneInfo.displayName}
          </Text>
          {someoneInfo.description && (
            <Text variant="bodyLarge" style={[styles.descriptionText, { color: theme.colors.onSurfaceVariant }]}>
              {someoneInfo.description}
            </Text>
          )}
          
          {/* Badges */}
          <View style={styles.badgeContainer}>
            {someoneInfo.isCurrentUser && (
              <Card style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                <Text variant="labelSmall" style={{ color: theme.colors.onPrimary }}>
                  {t('details.you_badge')}
                </Text>
              </Card>
            )}
            {someoneInfo.isAI && (
              <Card style={[styles.badge, { backgroundColor: theme.colors.secondary }]}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSecondary }}>
                  {t('details.ai_badge')}
                </Text>
              </Card>
            )}
          </View>
        </Card.Content>
      </Card>
      
      {/* Contact Actions */}
      {actions.length > 0 && (
        <Card style={styles.actionsCard}>
          <Card.Title title={t('details.contact_info')} />
          <Card.Content>
            {actions.map((action, index) => (
              <List.Item
                key={index}
                title={action.label}
                left={props => <List.Icon {...props} icon={action.icon} />}
                right={props => (
                  <IconButton
                    {...props}
                    icon="launch"
                    onPress={action.onPress}
                  />
                )}
                onPress={action.onPress}
                style={styles.actionItem}
              />
            ))}
          </Card.Content>
        </Card>
      )}
      
      {/* Connection Info */}
      {someoneInfo.connections && (
        <Card style={styles.connectionCard}>
          <Card.Title title={t('details.connection_info')} />
          <Card.Content>
            <List.Item
              title={`${someoneInfo.connections.active}/${someoneInfo.connections.total}`}
              description={t('details.active_connections')}
              left={props => <List.Icon {...props} icon="connection" />}
            />
            {someoneInfo.connections.lastSeen && (
              <List.Item
                title={someoneInfo.connections.lastSeen.toLocaleDateString()}
                description={t('details.last_seen')}
                left={props => <List.Icon {...props} icon="clock" />}
              />
            )}
          </Card.Content>
        </Card>
      )}
      
      {/* Technical Info */}
      <Card style={styles.technicalCard}>
        <Card.Title title={t('details.technical_info')} />
        <Card.Content>
          <List.Item
            title={someoneInfo.personId.substring(0, 16) + '...'}
            description={t('details.person_id')}
            left={props => <List.Icon {...props} icon="identifier" />}
          />
          <List.Item
            title={someoneInfo.someoneId.substring(0, 16) + '...'}
            description={t('details.someone_id')}
            left={props => <List.Icon {...props} icon="card-account-details" />}
          />
          {someoneInfo.allProfiles.length > 1 && (
            <List.Item
              title={someoneInfo.allProfiles.length.toString()}
              description={t('details.profile_count')}
              left={props => <List.Icon {...props} icon="account-multiple" />}
            />
          )}
        </Card.Content>
      </Card>
      
      {/* Action Buttons */}
      <Card style={styles.buttonCard}>
        <Card.Content style={styles.buttonContainer}>
          <Button 
            mode="outlined" 
            onPress={handleEdit}
            style={styles.actionButton}
            icon="pencil"
          >
            {t('details.edit')}
          </Button>
          
          <Button 
            mode="outlined" 
            onPress={handleConnect}
            style={styles.actionButton}
            icon="connection"
          >
            {t('details.connect')}
          </Button>
          
          <Button 
            mode="outlined" 
            onPress={handleDelete}
            textColor={theme.colors.error}
            style={styles.actionButton}
            icon="delete"
          >
            {t('details.delete')}
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  statusText: {
    marginTop: 16,
    textAlign: 'center',
  },
  errorCard: {
    margin: 16,
    borderRadius: 12,
  },
  errorTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    marginBottom: 24,
    textAlign: 'center',
  },
  profileCard: {
    margin: 16,
    borderRadius: 12,
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
  },
  avatar: {
    marginBottom: 16,
  },
  nameText: {
    marginBottom: 8,
    textAlign: 'center',
  },
  descriptionText: {
    marginBottom: 16,
    textAlign: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  actionsCard: {
    margin: 16,
    borderRadius: 12,
  },
  actionItem: {
    paddingVertical: 4,
  },
  connectionCard: {
    margin: 16,
    borderRadius: 12,
  },
  technicalCard: {
    margin: 16,
    borderRadius: 12,
  },
  buttonCard: {
    margin: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    minWidth: 100,
    marginVertical: 4,
  },
}); 