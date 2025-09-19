import React, { useState } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { TextInput, Button, useTheme, IconButton, HelperText, Divider, Text } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import QRCodeScanner from '@src/components/contacts/QRCodeScanner';
import { InviteManager } from '@src/models/contacts/InviteManager';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import Constants from 'expo-constants';
import { getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import SomeoneModel from '@refinio/one.models/lib/models/Leute/SomeoneModel.js';
import ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';

// Add an interface for the person description types
interface PersonDescription {
  $type$: string;
  [key: string]: any;
}

// Helper function for detailed object logging
const logObjectDetails = (prefix: string, obj: any) => {
  console.log(`[Contact Creation] ${prefix} Raw object properties before processing:`);
  if (!obj) {
    console.log(`[Contact Creation] ${prefix} Object is null or undefined`);
    return;
  }
  
  // Check for $type$ property
  if (obj.$type$) {
    console.log(`[Contact Creation] ${prefix} Object has $type$ property: ${obj.$type$}`);
  } else {
    console.log(`[Contact Creation] ${prefix} Object is missing $type$ property - this might be a type issue`);
    
    // Log more raw details about the object
    try {
      const objKeys = Object.keys(obj);
      console.log(`[Contact Creation] ${prefix} Object keys: ${objKeys.join(', ')}`);
      
      // If it has a serialize method, try to see what it returns
      if (typeof obj.serialize === 'function') {
        const serialized = obj.serialize();
        console.log(`[Contact Creation] ${prefix} Serialized object: ${JSON.stringify(serialized)}`);
      }
      
      // If no $type$ property, check the prototype chain
      const proto = Object.getPrototypeOf(obj);
      if (proto) {
        const protoKeys = Object.getOwnPropertyNames(proto);
        console.log(`[Contact Creation] ${prefix} Prototype methods: ${protoKeys.join(', ')}`);
        
        // Check if constructor has relevant info
        if (obj.constructor && obj.constructor.name) {
          console.log(`[Contact Creation] ${prefix} Constructor name: ${obj.constructor.name}`);
        }
      }
    } catch (e) {
      console.log(`[Contact Creation] ${prefix} Error analyzing object: ${e}`);
    }
  }
};

export default function AddContactScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation(Namespaces.CONTACTS);
  const { instance } = useInstance();
  const [hashIdentifier, setHashIdentifier] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddContact = async () => {
    // Reset error
    setError(null);
    
    if (!instance?.leuteModel) {
      setError(t('add_contact.errors.system_unavailable'));
      return;
    }

    // If hash identifier is provided, use that directly
    if (hashIdentifier.trim()) {
      await addContactByHash();
      return;
    }
    
    // Otherwise create a contact from email and name
    if (!email.trim()) {
      setError(t('add_contact.errors.email_required'));
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log(`[Contact Creation] Creating contact with email: ${email.trim()}`);
      
      try {
        // Step 1: Create a Someone with shallow identity
        // This creates a Person, Profile, and Someone in one step
        const someoneId = await instance.leuteModel.createSomeoneWithShallowIdentity(email.trim());
        console.log(`[Contact Creation] Created Someone with ID: ${someoneId}`);
        
        // Step 2: Add the Someone to contacts
        await instance.leuteModel.addSomeoneElse(someoneId);
        console.log(`[Contact Creation] Added Someone to contacts list`);
        
        // Step 3: Get the Someone object directly using the someone ID (not Person ID)
        console.log(`[Contact Creation] Retrieving Someone from contacts list`);
        
        // Get all contacts and find the one we just added
        const contacts = await instance.leuteModel.others();
        const someone = contacts.find(c => c.idHash === someoneId);
        
        if (!someone) {
          console.error(`[Contact Creation] Couldn't find Someone with ID ${someoneId} in contacts list`);
          throw new Error('Contact was added but cannot be retrieved. This may indicate an issue with the contact system.');
        }
        
        console.log(`[Contact Creation] Retrieved Someone object with ID: ${someoneId}`);
        
        // Step 4: Update the profile with name if provided
        if (name.trim()) {
          // Get the main profile
          const mainProfile = await someone.mainProfile();
          console.log(`[Contact Creation] Retrieved main profile for Someone ${someoneId}`);
          
          if (mainProfile) {
            console.log(`[Contact Creation] Updating profile with name: ${name.trim()}`);
            
            // Add or update PersonName description
            const hasNameDesc = mainProfile.personDescriptions.some(
              (desc: PersonDescription) => desc.$type$ === 'PersonName'
            );
            
            if (hasNameDesc) {
              // Update existing name
              for (const desc of mainProfile.personDescriptions) {
                if (desc.$type$ === 'PersonName') {
                  desc.name = name.trim();
                  console.log(`[Contact Creation] Updated existing PersonName description`);
                  break;
                }
              }
            } else {
              // Add new name description
              const nameDesc = { $type$: 'PersonName', name: name.trim() };
              console.log(`[Contact Creation] Adding new PersonName description`);
              mainProfile.personDescriptions.push(nameDesc);
            }
            
            // Save the profile changes
            console.log(`[Contact Creation] Saving profile changes to persistent storage`);
            await mainProfile.saveAndLoad();
            console.log(`[Contact Creation] Profile changes saved successfully`);
          }
        }
        
        // Success - navigate to contacts list
        router.push('/(screens)/contacts');
        
      } catch (error) {
        // Handle specific creation errors
        console.error(`[Contact Creation] Error in creation process: ${error}`);
        await handleContactCreationError(error, email.trim());
      }
    } catch (error) {
      // Handle any uncaught errors
      console.error('[Contact Creation] Unhandled error:', error);
      setError(t('add_contact.errors.failed'));
    } finally {
      setIsLoading(false);
    }
  };
  


  const addContactByHash = async () => {
    if (!instance?.leuteModel) {
      setError(t('add_contact.errors.system_unavailable'));
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Validate the hash format (SHA256 is 64 hex characters)
      const hash = hashIdentifier.trim();
      if (!/^[a-f0-9]{64}$/i.test(hash)) {
        throw new Error('Invalid hash format');
      }
      
      console.log(`[Contact Creation] Adding contact by hash: ${hash}`);
      
      try {
        // TODO: Task #165 - Clean up type ambiguity in contact creation API calls
        // This hash casting is dangerous and needs proper type validation
        // The hash could be:
        // 1. A Person ID hash (SHA256IdHash<Person>) - most common case
        // 2. A Someone ID hash (SHA256IdHash<Someone>) - if someone already created a Someone
        // 3. An object hash - less likely for contact creation
        
        let someone: InstanceType<typeof SomeoneModel> | null = null;
        
        // First, try as Person ID hash - this is the most common case
        // If a Person exists, we can create the object relationship chain
        // WARNING: This cast is unsafe and should be replaced with proper validation (Task #165)
        const personIdHash = hash as SHA256IdHash<Person>;
        
        try {
          // Check if we already have a Someone for this Person
          someone = await instance.leuteModel.getSomeone(personIdHash);
          if (someone) {
            console.log(`[Contact Creation] Found existing Someone for Person ID: ${personIdHash}`);
          }
        } catch (error) {
          console.log(`[Contact Creation] No existing Someone for Person ID: ${personIdHash}`);
        }
        
        // If no Someone exists yet, create the object relationship chain
        if (!someone) {
          console.log(`[Contact Creation] Creating object relationship chain for Person ID: ${personIdHash}`);
          
          // Follow the natural object relationship flow: Person → Profile → Someone
          // Let one.core handle object existence and deduplication automatically
          
          // Step 1: Create Profile for the Person (one.core handles deduplication)
          const profile = await ProfileModel.constructWithNewProfile(personIdHash);
          console.log(`[Contact Creation] Created/retrieved Profile for Person ${personIdHash}`);
          
          // Step 2: Create Someone object (one.core handles deduplication)
          someone = await SomeoneModel.constructWithNewSomeone(personIdHash);
          console.log(`[Contact Creation] Created/retrieved Someone for Person ${personIdHash}`);
        }
        
        if (!someone) {
          throw new Error(`Could not create or retrieve Someone object for Person ID ${personIdHash}`);
        }
        
        // Step 3: Add the Someone to contacts (addSomeoneElse expects a Someone ID)
        await instance.leuteModel.addSomeoneElse(someone.idHash);
        console.log(`[Contact Creation] Added Someone ${someone.idHash} to contacts`);
        
        // Update the name if provided
        if (name.trim()) {
          await updateContactName(someone);
        }
        
        // Success - navigate to contacts list
        router.push('/(screens)/contacts');
        
      } catch (error) {
        // Handle specific hash-based addition errors
        console.error(`[Contact Creation] Error in hash addition process: ${error}`);
        await handleContactCreationError(error, undefined, hash);
      }
    } catch (error) {
      // Handle validation or other errors
      console.error('[Contact Creation] Failed to add contact by hash:', error);
      
      if (error instanceof Error && error.message.includes('Invalid hash format')) {
        setError(t('add_contact.errors.invalid_hash'));
      } else {
        setError(t('add_contact.errors.failed'));
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Helper function to update a contact's name
  const updateContactName = async (someone: InstanceType<typeof SomeoneModel>) => {
    try {
      // Get the main profile
      const mainProfile = await someone.mainProfile();
      console.log(`[Contact Creation] Retrieved main profile for Someone ${someone.idHash}`);
      
      if (mainProfile) {
        console.log(`[Contact Creation] Updating profile with name: ${name.trim()}`);
        
        // Add or update PersonName description
        const hasNameDesc = mainProfile.personDescriptions.some(
          (desc: PersonDescription) => desc.$type$ === 'PersonName'
        );
        
        if (hasNameDesc) {
          // Update existing name
          for (const desc of mainProfile.personDescriptions) {
            if (desc.$type$ === 'PersonName') {
              desc.name = name.trim();
              console.log(`[Contact Creation] Updated existing PersonName description`);
              break;
            }
          }
        } else {
          // Add new name description
          const nameDesc = { $type$: 'PersonName', name: name.trim() };
          console.log(`[Contact Creation] Adding new PersonName description`);
          mainProfile.personDescriptions.push(nameDesc);
        }
        
        // Save the profile changes
        console.log(`[Contact Creation] Saving profile changes to persistent storage`);
        await mainProfile.saveAndLoad();
        console.log(`[Contact Creation] Profile changes saved successfully`);
      }
    } catch (error) {
      console.error(`[Contact Creation] Error updating contact name: ${error}`);
      throw error;
    }
  };
  
  /**
   * Common handler for contact creation errors
   * Helps reduce code duplication between the email and hash-based contact creation flows
   */
  const handleContactCreationError = async (error: any, email?: string, hash?: string) => {
    // If the person already exists, navigate to the edit screen
    if (error instanceof Error && error.message.includes('Person already exists')) {
      console.log(`[Contact Creation] Person already exists, looking up contact...`);
      
      try {
        // Get list of contacts
        const contacts = await instance?.leuteModel.others() || [];
        console.log(`[Contact Creation] Retrieved ${contacts.length} contacts for lookup`);
        
        let foundContact: InstanceType<typeof SomeoneModel> | null = null;
        
        if (hash) {
          // For hash-based contact, we can directly navigate using the hash
          console.log(`[Contact Creation] Using hash ${hash} to navigate to edit screen`);
          router.push(`/(screens)/contacts/edit/${hash}`);
          return;
        } else if (email) {
          // For email-based contact, we need to find the contact by email
          console.log(`[Contact Creation] Looking for contact with email: ${email}`);
          
          foundContact = contacts.find(contact => {
            try {
              const mainProfile = contact.mainProfile?.();
              if (mainProfile?.personDescriptions) {
                return mainProfile.personDescriptions.some((desc: any) => 
                  desc.$type$ === 'Email' && desc.address === email
                );
              }
            } catch (e) {
              // Ignore errors when checking profiles
            }
            return false;
          });
        }
        
        if (foundContact) {
          console.log(`[Contact Creation] Found existing contact, redirecting to edit screen`);
          router.push(`/(screens)/contacts/edit/${foundContact.idHash}`);
        } else {
          console.log(`[Contact Creation] Couldn't find matching contact for editing`);
          setError(t('add_contact.errors.not_retrievable'));
        }
      } catch (e) {
        console.error('[Contact Creation] Error finding existing contact:', e);
        setError(t('add_contact.errors.failed'));
      }
    } else {
      // For all other errors, display the generic error message
      setError(t('add_contact.errors.failed'));
    }
  };
  
  const handleStartScan = () => {
    setScanning(true);
  };
  
  const handleCancelScan = () => {
    setScanning(false);
  };
  
  const handleScanResult = async (data: string) => {
    if (!instance?.inviteManager) {
      console.error('[AddContact] InviteManager not available');
      setScanning(false);
      setError(t('add_contact.errors.failed'));
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('[AddContact] Processing scanned QR code data:', data);
      
      // Use InviteManager to accept the invitation URL
      await instance.inviteManager.acceptInvitationFromUrl(data);
      
      console.log('[AddContact] Invitation accepted successfully, navigating to contacts');
      // If successful, navigate to contacts list
      router.push('/(screens)/contacts');
    } catch (error) {
      console.error('[AddContact] Failed to process invite:', error);
      setScanning(false);
      
      // Provide specific error messages based on the error
      if (error instanceof Error) {
        if (error.message.includes('Failed to parse invitation URL')) {
          setError(t('add_contact.errors.invalid_qr'));
        } else if (error.message.includes('cryptographic key')) {
          setError(t('add_contact.errors.key_mismatch', 'This invitation is tied to a different device. Ask for a new invitation.'));
        } else {
          setError(error.message);
        }
      } else {
        setError(t('add_contact.errors.processing_failed'));
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleShareMyContact = () => {
    // Navigate to share contact screen
    router.push('/(screens)/contacts/share-contact');
  };

  const isFormValid = () => {
    return email.trim() !== '' || hashIdentifier.trim() !== '';
  };

  if (scanning) {
    return (
      <QRCodeScanner 
        onScan={handleScanResult} 
        onCancel={handleCancelScan} 
      />
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: t('add_contact.title'),
          headerBackTitle: t('common:actions.back'),
        }}
      />

      <View style={styles.content}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('add_contact.standard_title')}
        </Text>
        
        <TextInput
          mode="outlined"
          label={t('add_contact.name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          disabled={isLoading}
          style={styles.input}
        />
        
        <TextInput
          mode="outlined"
          label={t('add_contact.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          disabled={isLoading}
          style={styles.input}
        />
        
        <Divider style={styles.divider} />
        
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {t('add_contact.advanced_title')}
        </Text>
        
        <TextInput
          mode="outlined"
          label={t('add_contact.hash_identifier')}
          value={hashIdentifier}
          onChangeText={setHashIdentifier}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          disabled={isLoading}
          style={styles.input}
          right={
            <TextInput.Icon 
              icon="qrcode-scan" 
              onPress={handleStartScan}
              disabled={isLoading} 
            />
          }
          placeholder={t('add_contact.hash_placeholder')}
        />
        

        
        {error && (
          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>
        )}

        <View style={styles.buttonRow}>
          <Button
            mode="contained"
            onPress={handleAddContact}
            loading={isLoading}
            disabled={!isFormValid() || isLoading}
            style={styles.button}
          >
            {t('add_contact.add')}
          </Button>
          
          <Button
            mode="outlined"
            onPress={handleShareMyContact}
            disabled={isLoading}
            icon="qrcode"
            style={styles.button}
          >
            {t('add_contact.share_my_contact')}
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  input: {
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 8,
    marginTop: 8,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  button: {
    flex: 1,
  },
}); 