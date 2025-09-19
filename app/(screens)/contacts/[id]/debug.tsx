import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { Text, Button, Avatar, useTheme, Divider, IconButton, List } from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { ensureIdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
// ProfileModel is accessed through someone.mainProfile(), not imported directly
import { getObjectByIdHash, getCurrentVersion } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';

// Debug Helper component
const DebugInfo = ({ title, data, expanded = false }: { title: string, data: any, expanded?: boolean }) => {
  const theme = useTheme();
  const [isExpanded, setIsExpanded] = useState(expanded);
  
  return (
    <View style={[styles.debugContainer, { borderColor: theme.colors.outline }]}>
      <Button 
        onPress={() => setIsExpanded(!isExpanded)} 
        mode="text" 
        compact 
        style={{ alignSelf: 'flex-start' }}
      >
        {title} {isExpanded ? '▼' : '▶'}
      </Button>
      
      {isExpanded && (
        <ScrollView style={styles.debugScrollView}>
          <Text style={{ fontFamily: 'monospace' }}>
            {typeof data === 'object' 
              ? JSON.stringify(data, (key, value) => {
                  // Special handling for circular references and functions
                  if (key === '$type$' || key === 'idHash' || key === 'personId') {
                    return String(value);
                  }
                  if (typeof value === 'function') {
                    return '[Function]';
                  }
                  return value;
                }, 2) 
              : String(data)}
          </Text>
        </ScrollView>
      )}
    </View>
  );
};

// Type definitions for person descriptions
interface PersonDescription {
  $type$: string;
  [key: string]: any;
}

interface ContactInfo {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  phoneNumbers: {type: string; number: string}[];
  addresses: {type: string; address: string}[];
  organization: string | null;
}

export default function ContactDebugScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation(Namespaces.CONTACTS);
  const { instance } = useInstance();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    name: null,
    email: null,
    avatarUrl: null,
    phoneNumbers: [],
    addresses: [],
    organization: null
  });
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState<{
    personId: string | null;
    someone: any | null;
    profile: any | null;
    personDescriptions: any[] | null;
    logs: string[];
    contactsList: any[] | null;
    personIdDetails: {
      personObject: any | null;
      emailHash: string | null;
      personHash: string | null;
    };
  }>({
    personId: null,
    someone: null,
    profile: null,
    personDescriptions: null,
    logs: ["Initializing contact details screen"],
    contactsList: null,
    personIdDetails: {
      personObject: null,
      emailHash: null,
      personHash: null
    }
  });
  
  const addDebugLog = (message: string) => {
    setDebugInfo(prev => ({
      ...prev,
      logs: [...prev.logs, `${new Date().toLocaleTimeString()}: ${message}`]
    }));
    console.log(`[ContactDetails] ${message}`);
  };
  
  // Add a helper function to log object properties in detail
  const logObjectDetails = (prefix: string, obj: any) => {
    addDebugLog(`${prefix} Raw object properties before processing:`);
    if (!obj) {
      addDebugLog(`${prefix} Object is null or undefined`);
      return;
    }
    
    // Check for $type$ property
    if (obj.$type$) {
      addDebugLog(`${prefix} Object has $type$ property: ${obj.$type$}`);
    } else {
      addDebugLog(`${prefix} Object is missing $type$ property - this might be a type issue`);
      
      // Log more raw details about the object
      try {
        const objKeys = Object.keys(obj);
        addDebugLog(`${prefix} Object keys: ${objKeys.join(', ')}`);
        
        // If it has a serialize method, try to see what it returns
        if (typeof obj.serialize === 'function') {
          const serialized = obj.serialize();
          addDebugLog(`${prefix} Serialized object: ${JSON.stringify(serialized)}`);
        }
        
        // If no $type$ property, check the prototype chain
        const proto = Object.getPrototypeOf(obj);
        if (proto) {
          const protoKeys = Object.getOwnPropertyNames(proto);
          addDebugLog(`${prefix} Prototype methods: ${protoKeys.join(', ')}`);
          
          // Check if constructor has relevant info
          if (obj.constructor && obj.constructor.name) {
            addDebugLog(`${prefix} Constructor name: ${obj.constructor.name}`);
          }
        }
        
        // Manual attempt to detect the type based on available properties/methods
        if (obj.identities && typeof obj.identities === 'function') {
          addDebugLog(`${prefix} Manually setting $type$ to 'Someone'`);
          obj.$type$ = 'Someone';
        } else if (obj.personDescriptions) {
          addDebugLog(`${prefix} Manually setting $type$ to 'Profile'`);
          obj.$type$ = 'Profile';
        }
      } catch (e) {
        addDebugLog(`${prefix} Error analyzing object: ${e}`);
      }
    }
  };
  
  const loadContact = async () => {
      addDebugLog(`Starting to load contact with ID: ${id}`);
      
      if (!instance?.leuteModel) {
        addDebugLog("Error: LeuteModel is not available");
        setError(t('details.errors.not_available'));
        setLoading(false);
        return;
      }
      
      try {
        console.log('[ContactDetailsScreen] Loading contact info for id:', id);
        
        if (!id) {
          throw new Error('No contact ID provided');
        }
        
        // First get the Someone object for this ID
        if (!instance?.leuteModel) {
          throw new Error('LeuteModel not available');
        }
        
        addDebugLog(`Getting Someone with ID: ${id}`);
        
        // Load all contacts for comparison
        try {
          const contacts = await instance.leuteModel.others();
          addDebugLog(`Loaded ${contacts.length} contacts for comparison`);
          setDebugInfo(prev => ({ ...prev, contactsList: contacts }));
        } catch (e) {
          addDebugLog(`Error loading contacts list: ${e}`);
        }
        
        // First, try to find the contact in the others list by matching the ID
        const contacts = await instance.leuteModel.others();
        let someone = null;
        
        // Try to find by matching the person ID from identities
        for (const contact of contacts) {
          if (contact.pSomeone?.identities) {
            const identities = contact.pSomeone.identities;
            const firstIdentity = identities.keys().next().value;
            if (firstIdentity && firstIdentity === id) {
              someone = contact;
              break;
            }
          }
        }
        
        // If not found by person ID, try by idHash
        if (!someone) {
          someone = contacts.find(c => c.idHash === id);
        }
        
        // If still not found, try getSomeone as a fallback
        if (!someone) {
          const someoneId = ensureIdHash(id);
          someone = await instance.leuteModel.getSomeone(someoneId);
        }
        
        if (!someone) {
          throw new Error(`Contact not found with ID: ${id}`);
        }
        
        addDebugLog(`Found Someone with ID: ${id}`);
        
        // Store raw Someone object for debugging
        const someoneSafe = {
          idHash: someone.idHash,
          personId: (someone as any).personId,
          mainProfile: (someone as any).mainProfile,
        };
        setDebugInfo(prev => ({ ...prev, someone: someoneSafe }));
        
        // Get the main profile for this contact
        let profile = null;
        let personDescriptions = [];
        
        try {
          // Try to get the profile directly from the someone object
          if (typeof (someone as any).mainProfile === 'function') {
            profile = await (someone as any).mainProfile();
            addDebugLog(`Got profile from mainProfile method`);
          }
        } catch (e) {
          addDebugLog(`Error calling mainProfile: ${e}`);
        }
        
        if (!profile) {
          throw new Error('Contact has no main profile');
        }
        
        addDebugLog(`Found profile object`);
        
        // Get the profile data for debugging
        const safeProfile = {
          idHash: profile.idHash || 'unknown',
          personId: profile.personId || 'unknown',
          data: profile.data || null,
        };
        setDebugInfo(prev => ({ ...prev, profile: safeProfile }));
        
        // Get person descriptions
        if (profile.personDescriptions) {
          personDescriptions = profile.personDescriptions;
        } else if (profile.data?.personDescriptions) {
          personDescriptions = profile.data.personDescriptions;
        }
        
        if (Array.isArray(personDescriptions)) {
          addDebugLog(`Found ${personDescriptions.length} person descriptions`);
          setDebugInfo(prev => ({ ...prev, personDescriptions }));
          
          // Process all person descriptions to build the contact info
          const info: ContactInfo = {
            name: null,
            email: null,
            avatarUrl: null,
            phoneNumbers: [],
            addresses: [],
            organization: null
          };
          
          // Extract data from person descriptions
          for (const desc of personDescriptions) {
            if (!desc || typeof desc !== 'object') continue;
            
            const type = desc.$type$;
            addDebugLog(`Processing description of type: ${type}`);
            
            switch (type) {
              case 'PersonName':
                info.name = desc.name || null;
                addDebugLog(`Found name: ${desc.name || 'null'}`);
                break;
                
              case 'Email':
                info.email = desc.address || null;
                addDebugLog(`Found email: ${desc.address || 'null'}`);
                break;
                
              case 'ProfileImage':
                // Handle profile image if present
                addDebugLog(`Found ProfileImage`);
                break;
                
              case 'PhoneNumber':
                if (desc.number) {
                  addDebugLog(`Found phone number: ${desc.number}, type: ${desc.type || 'Other'}`);
                  info.phoneNumbers.push({
                    type: desc.type || 'Other',
                    number: desc.number
                  });
                }
                break;
                
              case 'PostalAddress':
                if (desc.formatted) {
                  addDebugLog(`Found address: ${desc.formatted}, type: ${desc.type || 'Other'}`);
                  info.addresses.push({
                    type: desc.type || 'Other',
                    address: desc.formatted
                  });
                }
                break;
                
              case 'OrganisationName':
                info.organization = desc.name || null;
                addDebugLog(`Found organization: ${desc.name || 'null'}`);
                break;
                
              case 'LLM':
              case 'AIPersonDescription':
                // Handle AI model data
                addDebugLog(`Found AI metadata of type ${type}`);
                if (!info.name && (desc.name || desc.model || desc.modelName)) {
                  info.name = desc.name || desc.model || desc.modelName;
                  addDebugLog(`Using AI model name: ${info.name}`);
                }
                
                // If it's a nested structure with llm property
                if (desc.llm && typeof desc.llm === 'object') {
                  if (!info.name && (desc.llm.name || desc.llm.model || desc.llm.modelName)) {
                    info.name = desc.llm.name || desc.llm.model || desc.llm.modelName;
                    addDebugLog(`Using nested AI model name: ${info.name}`);
                  }
                  
                  // Set organization from provider if available
                  if (desc.llm.provider && !info.organization) {
                    info.organization = desc.llm.provider.charAt(0).toUpperCase() + desc.llm.provider.slice(1);
                    addDebugLog(`Using AI provider as organization: ${info.organization}`);
                  }
                } 
                // Direct properties
                else if (desc.provider && !info.organization) {
                  info.organization = desc.provider.charAt(0).toUpperCase() + desc.provider.slice(1);
                  addDebugLog(`Using AI provider as organization: ${info.organization}`);
                }
                break;
                
              default:
                // Log unknown description types for debugging
                addDebugLog(`Unknown description type: ${type}`);
            }
          }
          
          // Check for avatar URL in profile data
          if (profile.data?.avatarUrl) {
            addDebugLog(`Found avatar URL: ${profile.data.avatarUrl}`);
            info.avatarUrl = profile.data.avatarUrl;
          }
          
          // If no name was found, check profile.data for AI metadata
          if (profile.data) {
            addDebugLog('Checking profile.data for additional information');
            
            // Check for AI model information
            if (profile.data.ai === true || profile.data.isAI === true) {
              addDebugLog('Found AI flag in profile data');
              
              // Check for model name if not already set
              if (!info.name) {
                const modelName = profile.data.name || 
                                  profile.data.modelName || 
                                  profile.data.model ||
                                  (profile.data.llm && profile.data.llm.name) ||
                                  (profile.data.llm && profile.data.llm.model);
                
                if (modelName) {
                  info.name = modelName;
                  addDebugLog(`Using AI model name from profile data: ${modelName}`);
                }
              }
              
              // Check for provider/organization if not already set
              if (!info.organization) {
                const provider = profile.data.provider || 
                                (profile.data.llm && profile.data.llm.provider) ||
                                (profile.data.AIMetadata && profile.data.AIMetadata.provider);
                
                if (provider) {
                  info.organization = provider.charAt(0).toUpperCase() + provider.slice(1);
                  addDebugLog(`Using AI provider from profile data: ${info.organization}`);
                }
              }
              
              // Check AIMetadata
              if (profile.data.AIMetadata) {
                addDebugLog('Found AIMetadata in profile data');
                
                if (!info.name && (profile.data.AIMetadata.name || profile.data.AIMetadata.id)) {
                  info.name = profile.data.AIMetadata.name || profile.data.AIMetadata.id;
                  addDebugLog(`Using name from AIMetadata: ${info.name}`);
                }
                
                if (!info.organization && profile.data.AIMetadata.provider) {
                  info.organization = profile.data.AIMetadata.provider.charAt(0).toUpperCase() + 
                                      profile.data.AIMetadata.provider.slice(1);
                  addDebugLog(`Using provider from AIMetadata: ${info.organization}`);
                }
              }
            }
            
            // Check for email if not already set
            if (!info.email && profile.data.email) {
              info.email = profile.data.email;
              addDebugLog(`Using email from profile data: ${info.email}`);
            }
          }
          
          // For AI models that still have no name, try to use email prefix as name
          if (!info.name && info.email && 
              (info.email.includes('@llama.local') || 
               info.email.includes('@lama.ai') || 
               info.email.includes('@ai.assistant'))) {
            const emailPrefix = info.email.split('@')[0];
            info.name = emailPrefix
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            addDebugLog(`Using formatted email prefix as name: ${info.name}`);
          }
          
          setContactInfo(info);
        } else {
          addDebugLog("No person descriptions found in profile");
        }
        
        // Get the Person ID of the contact using mainIdentity if available
        let contactPersonId;
        if (typeof (someone as any).mainIdentity === 'function') {
          contactPersonId = await (someone as any).mainIdentity();
          addDebugLog(`Got Person ID via mainIdentity: ${contactPersonId || 'null'}`);
        } else {
          contactPersonId = (someone as any).personId;
          addDebugLog(`Got Person ID via direct property: ${contactPersonId || 'null'}`);
        }
        
        setDebugInfo(prev => ({ ...prev, personId: contactPersonId }));
        
        // Fetch the actual Person object to examine its hash and email
        if (contactPersonId) {
          try {
            const personObj = await getObjectByIdHash(contactPersonId);
            if (personObj) {
              // Cast to any to access properties safely
              const personAny = personObj as any;
              
              const safePerson = { 
                $type$: personAny.$type$ || null,
                idHash: personAny.idHash || null,
                email: personAny.email || null
              };
              
              // Calculate hashes to determine where duplicates might be coming from
              const emailHash = personAny.email 
                ? personAny.email.substring(0, 12) + '...' 
                : null;
                
              const personHash = personAny.idHash ? 
                personAny.idHash.slice(0, 12) + '...' : null;
              
              addDebugLog(`Person object found with email: ${personAny.email || 'null'}`);
              addDebugLog(`Email value: ${personAny.email || 'null'}`);
              addDebugLog(`Person hash: ${personHash || 'null'}`);
              
              setDebugInfo(prev => ({ 
                ...prev, 
                personIdDetails: {
                  personObject: safePerson,
                  emailHash: personAny.email || null,
                  personHash
                }
              }));
            } else {
              addDebugLog(`Person object not found for ID: ${contactPersonId}`);
            }
          } catch (error) {
            addDebugLog(`Error fetching Person object: ${error}`);
          }
        }
        
        setLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        addDebugLog(`Error loading contact: ${errorMessage}`);
        console.error('Error loading contact:', err);
        setError(t('details.errors.loading'));
        setLoading(false);
      }
    };

  useEffect(() => {
    loadContact();
  }, [id, instance, t]);
  
  const handleEdit = () => {
    addDebugLog("Edit button pressed");
    // Placeholder for edit functionality
    router.push(`/(screens)/contacts/edit/${id}`);
  };
  
  const handleDelete = async () => {
    addDebugLog("Delete button pressed");
    if (!instance?.leuteModel || !id) {
      addDebugLog("Cannot delete - leuteModel or id is missing");
      return;
    }
    
    try {
      // Implement the proper delete logic here
      // This might vary depending on how contacts should be deleted
      addDebugLog("Delete functionality not implemented yet");
      
      // Navigate back after deletion
      router.back();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addDebugLog(`Error deleting contact: ${errorMessage}`);
      console.error('Error deleting contact:', err);
      setError(t('details.errors.delete'));
    }
  };
  
  const handleCall = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`);
  };
  
  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };
  
  const handleAddress = (address: string) => {
    // Open maps app with the address
    const encodedAddress = encodeURIComponent(address);
    Linking.openURL(`https://maps.apple.com/?q=${encodedAddress}`);
  };
  
  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 16 }}>{t('details.loading')}</Text>
        <DebugInfo title="Loading Logs" data={debugInfo.logs} expanded={true} />
      </View>
    );
  }
  
  if (error) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: t('details.title') }} />
        <View style={styles.centered}>
          <Text variant="headlineSmall" style={{ marginBottom: 16 }}>{t('details.error')}</Text>
          <Text style={{ marginBottom: 24, color: theme.colors.error }}>{error}</Text>
          <Button mode="contained" onPress={() => router.back()}>
            {t('common:actions.back')}
          </Button>
        </View>
        
        <Divider style={styles.divider} />
        
        <DebugInfo title="Error Logs" data={debugInfo.logs} expanded={true} />
        <DebugInfo title="Person ID" data={debugInfo.personId} />
        <DebugInfo title="Contacts List" data={debugInfo.contactsList} />
        <DebugInfo title="Someone Object" data={debugInfo.someone} />
        <DebugInfo title="Profile Object" data={debugInfo.profile} />
        <DebugInfo title="Person Descriptions" data={debugInfo.personDescriptions} />
      </ScrollView>
    );
  }
  
  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen 
        options={{ 
          title: `Debug: ${contactInfo.name || t('unnamed')}`,
          headerBackTitle: t('common:actions.back'),
          headerStyle: { backgroundColor: theme.colors.errorContainer },
          headerTintColor: theme.colors.onErrorContainer,
        }} 
      />
      
      {/* Debug Notice */}
      <View style={[styles.debugNotice, { backgroundColor: theme.colors.errorContainer }]}>
        <IconButton icon="bug" size={24} iconColor={theme.colors.onErrorContainer} />
        <Text variant="titleMedium" style={{ color: theme.colors.onErrorContainer }}>
          Debug Information View
        </Text>
      </View>
      
      <View style={styles.profileHeader}>
        <Avatar.Text 
          size={80} 
          label={contactInfo.name ? contactInfo.name.substring(0, 2).toUpperCase() : '?'} 
          style={styles.avatar}
        />
        <Text variant="headlineMedium" style={styles.nameText}>
          {contactInfo.name || t('unnamed')}
        </Text>
        {contactInfo.organization && (
          <Text variant="bodyLarge" style={styles.organizationText}>
            {contactInfo.organization}
          </Text>
        )}
        <Text variant="bodyMedium" style={styles.idText}>
          ID: {String(id).substring(0, 20)}...
        </Text>
      </View>
      
      <Divider style={styles.divider} />
      
      {/* Contact Info Section */}
      <View style={styles.contactInfoSection}>
        {/* Email */}
        {contactInfo.email && (
          <List.Item
            title={contactInfo.email}
            description={t('details.email')}
            left={props => <List.Icon {...props} icon="email" />}
            right={props => (
              <IconButton
                {...props}
                icon="send"
                onPress={() => handleEmail(contactInfo.email!)}
              />
            )}
            style={styles.contactItem}
          />
        )}
        
        {/* Phone Numbers */}
        {contactInfo.phoneNumbers.map((phone, index) => (
          <List.Item
            key={`phone-${index}`}
            title={phone.number}
            description={phone.type}
            left={props => <List.Icon {...props} icon="phone" />}
            right={props => (
              <IconButton
                {...props}
                icon="phone-outgoing"
                onPress={() => handleCall(phone.number)}
              />
            )}
            style={styles.contactItem}
          />
        ))}
        
        {/* Addresses */}
        {contactInfo.addresses.map((address, index) => (
          <List.Item
            key={`address-${index}`}
            title={address.address}
            description={address.type}
            left={props => <List.Icon {...props} icon="map-marker" />}
            right={props => (
              <IconButton
                {...props}
                icon="map"
                onPress={() => handleAddress(address.address)}
              />
            )}
            style={styles.contactItem}
          />
        ))}
        
        {/* ID Info */}
        <List.Item
          title={id || '-'}
          description={t('details.contact_id')}
          left={props => <List.Icon {...props} icon="card-account-details" />}
          style={styles.contactItem}
        />
      </View>
      
      <View style={styles.actionsContainer}>
        <Button 
          mode="outlined" 
          onPress={handleEdit}
          style={styles.actionButton}
        >
          {t('details.edit')}
        </Button>
        
        <Button 
          mode="outlined" 
          onPress={handleDelete}
          textColor={theme.colors.error}
          style={styles.actionButton}
        >
          {t('details.delete')}
        </Button>
        
        <Button
          mode="outlined"
          onPress={async () => {
            addDebugLog("Running contact and topic diagnostic repair");
            try {
              // Check if AppModel is available
              if (!instance) {
                addDebugLog("Error: AppModel not available for repair");
                return;
              }
              
              // Run the repair function
              const repaired = await instance.repairContactsAndTopics();
              addDebugLog(`Repair completed: ${repaired} items repaired`);
              
              // Reload contact details
              loadContact();
            } catch (error) {
              addDebugLog(`Error repairing contacts: ${error}`);
            }
          }}
          style={styles.actionButton}
          icon="tools"
        >
          Repair
        </Button>
      </View>
      
      <Divider style={styles.divider} />
      
      {/* Debug Information */}
      <Text variant="titleMedium" style={[styles.sectionTitle, { marginTop: 16, marginLeft: 16 }]}>
        Debug Information
      </Text>
      
      <DebugInfo title="Log Messages" data={debugInfo.logs} expanded={true} />
      <DebugInfo title="Person ID" data={debugInfo.personId} />
      
      {/* New content addressing details */}
      <View style={styles.contentAddressingInfo}>
        <Text variant="titleSmall" style={{ marginLeft: 16, marginBottom: 8 }}>
          Content Addressing Details:
        </Text>
        <List.Item
          title={debugInfo.personIdDetails?.emailHash || 'Not available'}
          description="Email (used to generate Person ID)"
          left={props => <List.Icon {...props} icon="email-fast" />}
          style={styles.contactItem}
        />
        <List.Item
          title={debugInfo.personIdDetails?.personHash || 'Not available'}
          description="Person Hash (ID hash of Person object)"
          left={props => <List.Icon {...props} icon="identifier" />}
          style={styles.contactItem}
        />
      </View>
      
      <DebugInfo title="Person Object" data={debugInfo.personIdDetails?.personObject} />
      <DebugInfo title="Contacts List" data={debugInfo.contactsList} />
      <DebugInfo title="Someone Object" data={debugInfo.someone} />
      <DebugInfo title="Profile Object" data={debugInfo.profile} />
      <DebugInfo title="Person Descriptions" data={debugInfo.personDescriptions} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  avatar: {
    marginBottom: 16,
  },
  nameText: {
    marginBottom: 8,
    textAlign: 'center',
  },
  organizationText: {
    marginBottom: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
  divider: {
    marginVertical: 16,
  },
  contactInfoSection: {
    marginBottom: 24,
  },
  contactItem: {
    paddingVertical: 8,
  },
  infoSection: {
    marginBottom: 24,
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  infoText: {
    marginBottom: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  actionButton: {
    minWidth: 120,
  },
  debugContainer: {
    margin: 8,
    padding: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  debugScrollView: {
    maxHeight: 200,
  },
  contentAddressingInfo: {
    marginVertical: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  debugNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginBottom: 8,
  },
  idText: {
    marginTop: 8,
    opacity: 0.6,
    fontSize: 12,
    fontFamily: 'monospace',
  },
}); 