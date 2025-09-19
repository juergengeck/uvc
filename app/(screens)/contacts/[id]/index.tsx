import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Linking } from 'react-native';
import { 
  Surface, 
  Text, 
  Avatar, 
  Button, 
  Divider, 
  List, 
  IconButton,
  ActivityIndicator,
  useTheme,
  Menu,
  Appbar
} from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';

interface ContactInfo {
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  isAI: boolean;
  aiModel?: string;
  personId: string;
}

export default function ContactProfileScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const { instance } = useInstance();
  
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    loadContactProfile();
  }, [id]);

  const loadContactProfile = async () => {
    if (!instance?.leuteModel || !instance?.aiAssistantModel) {
      setError('Models not available');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // Get all contacts
      const contacts = await instance.leuteModel.others();
      let someone = null;
      let personId = id as string;
      
      // Find the contact by person ID
      for (const contact of contacts) {
        if (contact.pSomeone?.identities) {
          const identities = contact.pSomeone.identities;
          const firstIdentity = identities.keys().next().value;
          if (firstIdentity && firstIdentity === id) {
            someone = contact;
            personId = firstIdentity;
            break;
          }
        }
      }
      
      if (!someone) {
        throw new Error('Contact not found');
      }
      
      // Check if this is an AI contact
      const isAI = await instance.aiAssistantModel.isAIContact(personId);
      
      // Get profile information
      let name = 'Unknown';
      let email = undefined;
      let phone = undefined;
      let organization = undefined;
      let aiModel = undefined;
      
      try {
        const profile = await someone.mainProfile();
        if (profile?.personDescriptions?.length > 0) {
          for (const desc of profile.personDescriptions) {
            if (desc.$type$ === 'PersonName' && desc.name) {
              name = desc.name;
            } else if (desc.$type$ === 'PersonEmail' && desc.email) {
              email = desc.email;
            } else if (desc.$type$ === 'PersonPhoneNumber' && desc.phoneNumber) {
              phone = desc.phoneNumber;
            } else if (desc.$type$ === 'PersonOrganization' && desc.organization) {
              organization = desc.organization;
            }
          }
        }
        
        // For AI contacts, get the model name
        if (isAI) {
          aiModel = name; // Usually the AI name is the model name
        }
      } catch (error) {
        console.warn('Error loading profile details:', error);
      }
      
      setContact({
        name,
        email,
        phone,
        organization,
        isAI,
        aiModel,
        personId
      });
      
    } catch (error) {
      console.error('Error loading contact:', error);
      setError(error instanceof Error ? error.message : 'Failed to load contact');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (!contact || !instance?.topicModel || !instance?.leuteModel) return;
    
    try {
      const myPersonId = await instance.leuteModel.myMainIdentity();
      const topic = await instance.topicModel.createOneToOneTopic(myPersonId, contact.personId);
      router.push(`/(screens)/chat/${topic.id}`);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  const handleEdit = () => {
    if (contact?.isAI) {
      // AI contacts can't be edited
      return;
    }
    router.push(`/(screens)/contacts/${id}/edit`);
  };

  const handleDelete = async () => {
    // TODO: Implement contact deletion
    console.log('Delete contact:', id);
  };

  const getAvatarLabel = (name: string) => {
    const cleanName = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const words = cleanName.split(/[\s\-_]+/).filter(w => w.length > 0);
    
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    } else if (words.length === 1) {
      const word = words[0];
      if (word.length >= 2) {
        return word.substring(0, 2).toUpperCase();
      }
      return word[0].toUpperCase();
    }
    
    return cleanName.substring(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !contact) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Contact not found'}</Text>
        <Button mode="contained" onPress={() => router.back()} style={styles.backButton}>
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: contact.name,
          headerShown: true,
          headerBackVisible: true,
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              onPress={() => router.back()}
              size={24}
            />
          ),
          headerRight: () => (
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  onPress={() => setMenuVisible(true)}
                />
              }
            >
              <Menu.Item
                leadingIcon="bug"
                onPress={() => {
                  setMenuVisible(false);
                  router.push(`/(screens)/contacts/${id}/debug`);
                }}
                title="Debug Info"
              />
            </Menu>
          ),
        }}
      />
      
      <ScrollView style={styles.container}>
        <Surface style={[styles.profileHeader, { backgroundColor: theme.colors.surface }]} elevation={0}>
          <View style={styles.avatarContainer}>
            {contact.isAI ? (
              <Avatar.Icon
                icon="robot"
                size={120}
                style={{ backgroundColor: theme.colors.tertiary }}
              />
            ) : (
              <Avatar.Text
                label={getAvatarLabel(contact.name)}
                size={120}
                style={{ backgroundColor: theme.colors.primary }}
              />
            )}
          </View>
          
          <Text variant="headlineMedium" style={styles.name}>
            {contact.name}
          </Text>
          
          {contact.isAI && (
            <Text variant="labelLarge" style={[styles.aiLabel, { color: theme.colors.tertiary }]}>
              AI Assistant
            </Text>
          )}
          
          {contact.organization && (
            <Text variant="bodyLarge" style={styles.organization}>
              {contact.organization}
            </Text>
          )}
        </Surface>

        <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.actionButtons}>
            <Button
              mode="contained"
              icon="message"
              onPress={handleStartChat}
              style={styles.actionButton}
            >
              Start Chat
            </Button>
            
            {!contact.isAI && (
              <Button
                mode="outlined"
                icon="pencil"
                onPress={handleEdit}
                style={styles.actionButton}
              >
                Edit
              </Button>
            )}
          </View>
        </Surface>

        {(contact.email || contact.phone) && (
          <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <List.Section>
              {contact.email && (
                <List.Item
                  title={contact.email}
                  description="Email"
                  left={(props) => <List.Icon {...props} icon="email" />}
                  onPress={() => Linking.openURL(`mailto:${contact.email}`)}
                />
              )}
              
              {contact.phone && (
                <List.Item
                  title={contact.phone}
                  description="Phone"
                  left={(props) => <List.Icon {...props} icon="phone" />}
                  onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                />
              )}
            </List.Section>
          </Surface>
        )}

        {contact.isAI && contact.aiModel && (
          <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <List.Section>
              <List.Subheader>AI Information</List.Subheader>
              <List.Item
                title={contact.aiModel}
                description="Model"
                left={(props) => <List.Icon {...props} icon="chip" />}
              />
            </List.Section>
          </Surface>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 10,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  name: {
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  aiLabel: {
    marginTop: 4,
    marginBottom: 8,
  },
  organization: {
    opacity: 0.7,
    textAlign: 'center',
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  bottomPadding: {
    height: 32,
  },
});