import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Button, useTheme, Divider, TextInput } from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

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

interface ContactFormData {
  name: string;
  email: string;
  organization: string;
  phoneNumbers: Array<{
    type: string;
    number: string;
  }>;
  addresses: Array<{
    type: string;
    address: string;
  }>;
}

export default function EditContactScreen() {
  const { t } = useTranslation(Namespaces.CONTACTS);
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const instance = useInstance();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    organization: '',
    phoneNumbers: [],
    addresses: []
  });
  
  // Debugging information
  const [debugInfo, setDebugInfo] = useState<{
    logs: string[];
    personId: string;
    contactsList: any[];
    someone: any;
    profile: any;
    personDescriptions: PersonDescription[];
  }>({
    logs: [],
    personId: id || '',
    contactsList: [],
    someone: null,
    profile: null,
    personDescriptions: []
  });
  
  const addDebugLog = (message: string) => {
    console.log(`[ContactEdit] ${message}`);
    setDebugInfo(prev => ({
      ...prev,
      logs: [...prev.logs, message]
    }));
  };
  
  // Helper function for detailed object logging
  const logObjectDetails = (prefix: string, obj: any) => {
    if (!obj) {
      addDebugLog(`${prefix} Object is null or undefined`);
      return;
    }
    
    addDebugLog(`${prefix} Raw object properties before processing:`);
    
    // Check if object has $type$ property
    if (!obj.$type$) {
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
  
  useEffect(() => {
    async function loadContact() {
      addDebugLog(`Starting to load contact with ID: ${id}`);
      
      if (!instance?.instance?.leuteModel) {
        addDebugLog("Error: LeuteModel not available");
        setError(t('details.errors.not_available'));
        setLoading(false);
        return;
      }
      
      if (!id) {
        addDebugLog("Error: No contact ID provided");
        setError(t('details.errors.not_found'));
        setLoading(false);
        return;
      }
      
      try {
        addDebugLog(`Using personId: ${id}`);
        setDebugInfo(prev => ({ ...prev, personId: id }));
        
        // Get list of all contacts
        const contacts = await instance.instance.leuteModel.others();
        addDebugLog(`Found ${contacts.length} contacts in leuteModel.others()`);
        
        // Log detailed info about each contact for debugging
        contacts.forEach((contact: any, index: number) => {
          addDebugLog(`Contact #${index + 1} - idHash: ${contact.idHash}, type: ${contact.$type$}`);
          addDebugLog(`Contact #${index + 1} - Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(contact) || {}).join(', ')}`);
          addDebugLog(`Contact #${index + 1} - Properties: ${Object.keys(contact).join(', ')}`);
          
          // Log the main identity
          const mainIdentity = contact.mainIdentity ? contact.mainIdentity() : null;
          addDebugLog(`Contact #${index + 1} - mainIdentity: ${mainIdentity ? '[object Object]' : 'null'}`);
        });
        
        // Store for debugging
        setDebugInfo(prev => ({ ...prev, contactsList: contacts }));
        
        // Find the contact with matching identity
        const contact = contacts.find((c: any) => {
          if (c.mainIdentity && typeof c.mainIdentity === 'function') {
            const identity = c.mainIdentity();
            return identity && identity === id;
          }
          return c.idHash === id;
        });
        
        if (!contact) {
          addDebugLog("Error: Contact not found in contacts list");
          setError(t('details.errors.not_found'));
          setLoading(false);
          return;
        }
        
        addDebugLog(`Found contact in contacts list with identity matching personId`);
        
        // Get the Someone object
        const someone = contact;
        logObjectDetails('[Someone]', someone);
        
        // Store for debugging
        const safeSomeone = {
          $type$: someone.$type$ || 'Unknown Type',
          idHash: someone.idHash || 'Unknown idHash',
          mainIdentity: someone.mainIdentity ? someone.mainIdentity() : null,
          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(someone) || {}),
          properties: Object.keys(someone)
        };
        setDebugInfo(prev => ({ ...prev, someone: safeSomeone }));
        
        // Get the profile from Someone
        addDebugLog(`Attempting to get main profile with someone.mainProfile()`);
        let profile;
        
        try {
          profile = await someone.mainProfile();
        } catch (e) {
          addDebugLog(`Error getting mainProfile: ${e}`);
          
          // Try alternative approaches if mainProfile fails
          if (someone.profiles && typeof someone.profiles === 'function') {
            try {
              const allProfiles = await someone.profiles();
              addDebugLog(`Found ${allProfiles.length} profiles via profiles() method`);
              if (allProfiles.length > 0) {
                profile = allProfiles[0];
                addDebugLog(`Using first profile from profiles() method`);
              }
            } catch (e) {
              addDebugLog(`Error getting profiles: ${e}`);
            }
          }
        }
        
        if (!profile) {
          addDebugLog("Error: Profile object not found");
          setError(t('details.errors.no_profile'));
          setLoading(false);
          return;
        }
        
        logObjectDetails('[Profile]', profile);
        addDebugLog(`Profile retrieved. Type: ${profile.$type$}, ID: ${profile.idHash}`);
        
        // Store profile for debugging
        const safeProfile = {
          $type$: profile.$type$ || 'Unknown Type',
          idHash: profile.idHash || 'Unknown idHash',
          personId: profile.personId || 'Unknown personId',
          personDescriptions: profile.personDescriptions || [],
          hasData: !!profile.data,
          dataKeys: profile.data ? Object.keys(profile.data) : [],
          methods: Object.getOwnPropertyNames(Object.getPrototypeOf(profile) || {}),
          properties: Object.keys(profile)
        };
        setDebugInfo(prev => ({ ...prev, profile: safeProfile }));
        
        // Extract data from person descriptions
        const personDescriptions = profile.personDescriptions || [];
        if (Array.isArray(personDescriptions)) {
          addDebugLog(`Found ${personDescriptions.length} person descriptions`);
          setDebugInfo(prev => ({ ...prev, personDescriptions }));
          
          // Initialize form data with existing contact information
          const data: ContactFormData = {
            name: '',
            email: '',
            organization: '',
            phoneNumbers: [],
            addresses: []
          };
          
          // Extract data from person descriptions
          for (const desc of personDescriptions) {
            if (!desc || typeof desc !== 'object') continue;
            
            const type = desc.$type$;
            addDebugLog(`Processing description of type: ${type}`);
            
            switch (type) {
              case 'PersonName':
                data.name = desc.name || '';
                addDebugLog(`Found name: ${desc.name || 'empty'}`);
                break;
                
              case 'Email':
                data.email = desc.address || '';
                addDebugLog(`Found email: ${desc.address || 'empty'}`);
                break;
                
              case 'Organization':
                data.organization = desc.name || '';
                addDebugLog(`Found organization: ${desc.name || 'empty'}`);
                break;
                
              case 'PhoneNumber':
                if (desc.number) {
                  addDebugLog(`Found phone number: ${desc.number}, type: ${desc.type || 'Other'}`);
                  data.phoneNumbers.push({
                    type: desc.type || 'Other',
                    number: desc.number
                  });
                }
                break;
                
              case 'Address':
                if (desc.address) {
                  addDebugLog(`Found address: ${desc.address}, type: ${desc.type || 'Other'}`);
                  data.addresses.push({
                    type: desc.type || 'Other',
                    address: desc.address
                  });
                }
                break;
                
              default:
                addDebugLog(`Skipping unsupported description type: ${type}`);
            }
          }
          
          // If there are no phone numbers or addresses, add empty ones for the form
          if (data.phoneNumbers.length === 0) {
            data.phoneNumbers.push({ type: 'Mobile', number: '' });
          }
          
          if (data.addresses.length === 0) {
            data.addresses.push({ type: 'Home', address: '' });
          }
          
          // Set the form data
          setFormData(data);
        }
        
        setLoading(false);
      } catch (error) {
        addDebugLog(`Error loading contact: ${error}`);
        setError(t('details.errors.loading'));
        setLoading(false);
      }
    }
    
    loadContact();
  }, [id, instance, t]);
  
  const handleAddPhoneNumber = () => {
    setFormData(prev => ({
      ...prev,
      phoneNumbers: [...prev.phoneNumbers, { type: 'Mobile', number: '' }]
    }));
  };
  
  const handleRemovePhoneNumber = (index: number) => {
    if (formData.phoneNumbers.length <= 1) return;
    
    setFormData(prev => ({
      ...prev,
      phoneNumbers: prev.phoneNumbers.filter((_, i) => i !== index)
    }));
  };
  
  const handleAddAddress = () => {
    setFormData(prev => ({
      ...prev,
      addresses: [...prev.addresses, { type: 'Home', address: '' }]
    }));
  };
  
  const handleRemoveAddress = (index: number) => {
    if (formData.addresses.length <= 1) return;
    
    setFormData(prev => ({
      ...prev,
      addresses: prev.addresses.filter((_, i) => i !== index)
    }));
  };
  
  const handleSave = async () => {
    if (!instance?.instance?.leuteModel || !id) {
      setError(t('details.errors.not_available'));
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      addDebugLog(`Starting to save contact with ID: ${id}`);
      
      // Find the contact in the contacts list
      const contacts = await instance.instance.leuteModel.others();
      const contact = contacts.find((c: any) => {
        if (c.mainIdentity && typeof c.mainIdentity === 'function') {
          const identity = c.mainIdentity();
          return identity && identity === id;
        }
        return c.idHash === id;
      });
      
      if (!contact) {
        addDebugLog("Error: Contact not found in contacts list");
        setError(t('details.errors.not_found'));
        setSaving(false);
        return;
      }
      
      // Get the profile
      let profile;
      try {
        profile = await contact.mainProfile();
      } catch (e) {
        addDebugLog(`Error getting mainProfile: ${e}`);
        
        // Try alternative approaches if mainProfile fails
        if (contact.profiles && typeof contact.profiles === 'function') {
          try {
            const allProfiles = await contact.profiles();
            if (allProfiles.length > 0) {
              profile = allProfiles[0];
            }
          } catch (e) {
            addDebugLog(`Error getting profiles: ${e}`);
          }
        }
      }
      
      if (!profile) {
        addDebugLog("Error: Profile object not found");
        setError(t('details.errors.no_profile'));
        setSaving(false);
        return;
      }
      
      // Update or create person descriptions
      const personDescriptions = profile.personDescriptions || [];
      
      // Update PersonName
      const nameDescIndex = personDescriptions.findIndex((desc: PersonDescription) => desc.$type$ === 'PersonName');
      if (nameDescIndex >= 0) {
        personDescriptions[nameDescIndex].name = formData.name.trim();
      } else if (formData.name.trim()) {
        personDescriptions.push({ $type$: 'PersonName', name: formData.name.trim() });
      }
      
      // Update Email
      const emailDescIndex = personDescriptions.findIndex((desc: PersonDescription) => desc.$type$ === 'Email');
      if (emailDescIndex >= 0) {
        personDescriptions[emailDescIndex].address = formData.email.trim();
      } else if (formData.email.trim()) {
        personDescriptions.push({ $type$: 'Email', address: formData.email.trim() });
      }
      
      // Update Organization
      const orgDescIndex = personDescriptions.findIndex((desc: PersonDescription) => desc.$type$ === 'Organization');
      if (orgDescIndex >= 0) {
        if (formData.organization.trim()) {
          personDescriptions[orgDescIndex].name = formData.organization.trim();
        } else {
          // Remove if empty
          personDescriptions.splice(orgDescIndex, 1);
        }
      } else if (formData.organization.trim()) {
        personDescriptions.push({ $type$: 'Organization', name: formData.organization.trim() });
      }
      
      // Update phone numbers
      // First remove all existing phone numbers
      const phoneIndices = [];
      for (let i = 0; i < personDescriptions.length; i++) {
        if (personDescriptions[i].$type$ === 'PhoneNumber') {
          phoneIndices.push(i);
        }
      }
      
      // Remove from highest index to lowest to not affect array positions
      for (let i = phoneIndices.length - 1; i >= 0; i--) {
        personDescriptions.splice(phoneIndices[i], 1);
      }
      
      // Add new phone numbers
      for (const phone of formData.phoneNumbers) {
        if (phone.number.trim()) {
          personDescriptions.push({ 
            $type$: 'PhoneNumber', 
            type: phone.type, 
            number: phone.number.trim() 
          });
        }
      }
      
      // Update addresses
      // First remove all existing addresses
      const addressIndices = [];
      for (let i = 0; i < personDescriptions.length; i++) {
        if (personDescriptions[i].$type$ === 'Address') {
          addressIndices.push(i);
        }
      }
      
      // Remove from highest index to lowest to not affect array positions
      for (let i = addressIndices.length - 1; i >= 0; i--) {
        personDescriptions.splice(addressIndices[i], 1);
      }
      
      // Add new addresses
      for (const addr of formData.addresses) {
        if (addr.address.trim()) {
          personDescriptions.push({ 
            $type$: 'Address', 
            type: addr.type, 
            address: addr.address.trim() 
          });
        }
      }
      
      // Save the updated profile
      profile.personDescriptions = personDescriptions;
      addDebugLog(`Saving profile changes`);
      await profile.saveAndLoad();
      
      addDebugLog(`Contact saved successfully`);
      
      // Navigate back to the contact details screen
      router.push(`/(screens)/contacts/${id}`);
    } catch (error) {
      addDebugLog(`Error saving contact: ${error}`);
      setError(`${t('details.errors.loading')}: ${error}`);
    } finally {
      setSaving(false);
    }
  };
  
  const handleCancel = () => {
    router.back();
  };
  
  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: t('details.title') }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 16 }}>{t('details.loading')}</Text>
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: t('details.edit') }} />
        
        <View style={styles.formSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>{t('add_contact.standard_title')}</Text>
          
          <TextInput
            label={t('add_contact.name')}
            value={formData.name}
            onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
            style={styles.input}
            mode="outlined"
          />
          
          <TextInput
            label={t('add_contact.email')}
            value={formData.email}
            onChangeText={text => setFormData(prev => ({ ...prev, email: text }))}
            style={styles.input}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
          <TextInput
            label={t('details.organization')}
            value={formData.organization}
            onChangeText={text => setFormData(prev => ({ ...prev, organization: text }))}
            style={styles.input}
            mode="outlined"
          />
        </View>
        
        <Divider style={styles.divider} />
        
        <View style={styles.formSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>{t('details.phone_numbers')}</Text>
          
          {formData.phoneNumbers.map((phone, index) => (
            <View key={`phone-${index}`} style={styles.fieldGroup}>
              <TextInput
                label={t('details.phone_type')}
                value={phone.type}
                onChangeText={text => {
                  const updated = [...formData.phoneNumbers];
                  updated[index].type = text;
                  setFormData(prev => ({ ...prev, phoneNumbers: updated }));
                }}
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                mode="outlined"
              />
              
              <TextInput
                label={t('details.phone_number')}
                value={phone.number}
                onChangeText={text => {
                  const updated = [...formData.phoneNumbers];
                  updated[index].number = text;
                  setFormData(prev => ({ ...prev, phoneNumbers: updated }));
                }}
                style={[styles.input, { flex: 2 }]}
                mode="outlined"
                keyboardType="phone-pad"
              />
              
              <Button
                icon="minus-circle"
                mode="text"
                onPress={() => handleRemovePhoneNumber(index)}
                style={{ marginTop: 8 }}
                disabled={formData.phoneNumbers.length <= 1}
              >
                {''}
              </Button>
            </View>
          ))}
          
          <Button
            icon="plus-circle"
            mode="outlined"
            onPress={handleAddPhoneNumber}
            style={styles.addButton}
          >
            {t('details.add_phone')}
          </Button>
        </View>
        
        <Divider style={styles.divider} />
        
        <View style={styles.formSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>{t('details.addresses')}</Text>
          
          {formData.addresses.map((addr, index) => (
            <View key={`addr-${index}`} style={styles.fieldGroup}>
              <TextInput
                label={t('details.address_type')}
                value={addr.type}
                onChangeText={text => {
                  const updated = [...formData.addresses];
                  updated[index].type = text;
                  setFormData(prev => ({ ...prev, addresses: updated }));
                }}
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                mode="outlined"
              />
              
              <TextInput
                label={t('details.address')}
                value={addr.address}
                onChangeText={text => {
                  const updated = [...formData.addresses];
                  updated[index].address = text;
                  setFormData(prev => ({ ...prev, addresses: updated }));
                }}
                style={[styles.input, { flex: 2 }]}
                mode="outlined"
                multiline
              />
              
              <Button
                icon="minus-circle"
                mode="text"
                onPress={() => handleRemoveAddress(index)}
                style={{ marginTop: 8 }}
                disabled={formData.addresses.length <= 1}
              >
                {''}
              </Button>
            </View>
          ))}
          
          <Button
            icon="plus-circle"
            mode="outlined"
            onPress={handleAddAddress}
            style={styles.addButton}
          >
            {t('details.add_address')}
          </Button>
        </View>
        
        <View style={styles.actionsContainer}>
          <Button 
            mode="outlined" 
            onPress={handleCancel}
            style={styles.actionButton}
          >
            {t('common:actions.cancel')}
          </Button>
          
          <Button 
            mode="contained" 
            onPress={handleSave}
            style={styles.actionButton}
            loading={saving}
            disabled={saving}
          >
            {t('common:actions.save')}
          </Button>
        </View>
        
        <Divider style={styles.divider} />
        
        <DebugInfo title="Debug Logs" data={debugInfo.logs} />
        <DebugInfo title="Form Data" data={formData} />
        <DebugInfo title="Person Descriptions" data={debugInfo.personDescriptions} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  },
  formSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  fieldGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  input: {
    marginBottom: 12,
  },
  addButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 24,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 8,
  },
  divider: {
    marginVertical: 16,
  },
  debugContainer: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginVertical: 8,
  },
  debugScrollView: {
    maxHeight: 200,
  },
}); 