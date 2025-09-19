import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Surface, IconButton, Text, Switch, List, Chip, Avatar } from 'react-native-paper';
import { router } from 'expo-router';
import { useModel } from '@/hooks/model';
import { Button } from '@/components/Button';
import { useNotificationContext, NOTIFICATION } from '@/components/notification/SnackbarNotification';
import { useTheme } from '@src/providers/app/AppTheme';
import { useTranslation } from 'react-i18next';
import { Stack, useNavigation } from 'expo-router';
import { useInstance } from '@src/providers/app';
import { v4 as uuidv4 } from 'uuid';
import { SomeoneContactList } from '@src/components/SomeoneContactList';
import { createGroupIfNotExist, addPersonToGroupByName } from '@src/utils/groupUtils';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

export default function NewTopic() {
  const { instance, models } = useInstance();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setNotificationMessage, setNotificationType } = useNotificationContext();
  const { theme } = useTheme();
  const { t } = useTranslation('chat');
  const { t: tCommon } = useTranslation('common');
  const navigation = useNavigation();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastCreatedTopic, setLastCreatedTopic] = useState<string | null>(null);
  const [showManualNav, setShowManualNav] = useState(false);
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<Array<{
    id: SHA256IdHash<Person>;
    displayName: string;
  }>>([]);
  
  const navigateToTopic = (topicId: string) => {
    try {
      router.push(`/(screens)/chat/${topicId}`);
    } catch (e) {
      console.error(`[ChatNewTopic] Navigation failed:`, e);
      setNotificationMessage('Navigation failed. Please use the home button.');
      setNotificationType(NOTIFICATION.Error);
    }
  };
  
  const handleFormSubmit = async () => {
    if (!models?.topicModel) {
      setNotificationMessage('Error: Topic model not initialized');
      setNotificationType(NOTIFICATION.Error);
      return;
    }
    
    if (!name.trim()) {
      setNotificationMessage('Please enter a topic name');
      setNotificationType(NOTIFICATION.Error);
      return;
    }
    
    setIsSubmitting(true);
    setStatusMessage('Creating topic...');
    
    try {
      // Generate a unique ID for the topic
      const topicId = `topic-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      if (isGroupChat && selectedParticipants.length > 0) {
        // For group chats with participants:
        // 1. Create a group with the selected participants
        const groupName = `group-${topicId}`;
        const myPersonId = await models.leuteModel.myMainIdentity();
        
        // Create group with current user and selected participants
        const groupMembers = [myPersonId, ...selectedParticipants.map(p => p.id)];
        await createGroupIfNotExist(groupName, groupMembers);
        
        // 2. Create a topic for this group
        console.log(`[ChatNewTopic] Creating group topic with ID: ${topicId} and name: ${name.trim()}`);
        const topic = await models.topicModel.createGroupTopic(name.trim(), topicId);
        
        // Note: In one.leute, they would call addGroupToTopic here
        // but our TopicModel doesn't expose this method yet
      } else {
        // Create a regular group topic without specific participants
        console.log(`[ChatNewTopic] Creating topic with ID: ${topicId} and name: ${name.trim()}`);
        const topic = await models.topicModel.createGroupTopic(name.trim(), topicId);
        
        if (!topic) {
          throw new Error('Failed to create topic - no topic response');
        }
      }
      
      // Show success state
      setStatusMessage('Topic ready');
      setLastCreatedTopic(topicId);
      setShowManualNav(true);
      setIsSubmitting(false);
      
      // Navigate
      router.push(`/(screens)/chat/${topicId}`);
    } catch (error) {
      console.error(`[ChatNewTopic] Error:`, error);
      setNotificationMessage(`Failed to create topic: ${error instanceof Error ? error.message : String(error)}`);
      setNotificationType(NOTIFICATION.Error);
      setIsSubmitting(false);
    }
  };
  
  const handleBack = () => {
    router.back();
  };

  const handleContactSelected = (someone: any) => {
    // Toggle selection
    const isSelected = selectedParticipants.some(p => p.id === someone.personId);
    if (isSelected) {
      setSelectedParticipants(prev => prev.filter(p => p.id !== someone.personId));
    } else {
      setSelectedParticipants(prev => [...prev, {
        id: someone.personId,
        displayName: someone.displayName || 'Unknown'
      }]);
    }
  };

  const removeParticipant = (participantId: SHA256IdHash<Person>) => {
    setSelectedParticipants(prev => prev.filter(p => p.id !== participantId));
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: t('newTopic'),
          headerLeft: () => (
            <IconButton
              icon="chevron-left"
              onPress={() => navigation.goBack()}
              size={24}
            />
          ),
        }}
      />
      
      <ScrollView style={styles.content}>
        {statusMessage && (
          <Surface style={[styles.section, { backgroundColor: theme.colors.primaryContainer }]}>
            <View style={styles.sectionContent}>
              <Text style={{ color: theme.colors.onPrimaryContainer }}>
                {statusMessage}
              </Text>
            </View>
          </Surface>
        )}
        
        {showManualNav && lastCreatedTopic && (
          <Surface style={[styles.section, { backgroundColor: theme.colors.secondaryContainer }]}>
            <View style={styles.sectionContent}>
              <Text style={{ color: theme.colors.onSecondaryContainer, marginBottom: 8, fontWeight: 'bold' }}>
                Topic Created
              </Text>
              <Text style={{ color: theme.colors.onSecondaryContainer, marginBottom: 12 }}>
                Navigate to your new topic:
              </Text>
              <View style={styles.buttonContainer}>
                <Button
                  title="Go to Topic"
                  onPress={() => navigateToTopic(lastCreatedTopic)}
                />
                <Button
                  title="Go Home"
                  onPress={() => router.push('/')}
                  mode="outlined"
                />
              </View>
            </View>
          </Surface>
        )}

        <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.sectionContent}>
            <TextInput
              label={t('topicName')}
              value={name}
              onChangeText={setName}
              style={[styles.input, { backgroundColor: theme.colors.surface }]}
              disabled={isSubmitting}
              autoFocus
              onSubmitEditing={handleFormSubmit}
              returnKeyType="done"
            />
            
            {/* Group Chat Toggle */}
            <View style={styles.groupToggle}>
              <Text variant="bodyLarge">{t('createGroupChat')}</Text>
              <Switch
                value={isGroupChat}
                onValueChange={setIsGroupChat}
                disabled={isSubmitting}
              />
            </View>
          </View>
        </Surface>

        {/* Selected Participants */}
        {isGroupChat && selectedParticipants.length > 0 && (
          <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={styles.sectionContent}>
              <Text variant="titleSmall" style={styles.sectionTitle}>
                {t('selectedParticipants')} ({selectedParticipants.length})
              </Text>
              <View style={styles.chipContainer}>
                {selectedParticipants.map((participant) => (
                  <Chip
                    key={participant.id}
                    onClose={() => removeParticipant(participant.id)}
                    style={styles.chip}
                  >
                    {participant.displayName}
                  </Chip>
                ))}
              </View>
            </View>
          </Surface>
        )}

        {/* Contact Selection */}
        {isGroupChat && (
          <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={styles.sectionContent}>
              <Text variant="titleSmall" style={styles.sectionTitle}>
                {t('selectContacts')}
              </Text>
              <View style={styles.contactListContainer}>
                <SomeoneContactList
                  filter="all"
                  onSomeoneSelected={handleContactSelected}
                />
              </View>
            </View>
          </Surface>
        )}

        <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.sectionContent}>
            <View style={styles.buttonContainer}>
              <Button
                title={t('create')}
                onPress={handleFormSubmit}
                disabled={isSubmitting || !name.trim()}
                loading={isSubmitting}
              />
              <Button
                title={tCommon('cancel')}
                onPress={handleBack}
                disabled={isSubmitting}
                mode="outlined"
              />
            </View>
          </View>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  section: {
    marginBottom: 16,
    borderRadius: 12,
  },
  sectionContent: {
    overflow: 'hidden',
    padding: 16,
  },
  input: {
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  backButton: {
    marginLeft: -4,
  },
  groupToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    marginBottom: 4,
  },
  contactListContainer: {
    maxHeight: 300,
  },
}); 