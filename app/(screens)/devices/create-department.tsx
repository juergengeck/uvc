import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, useTheme, Text, HelperText, Card, Title, List, RadioButton } from 'react-native-paper';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import type { Department, Organisation } from '@OneObjectInterfaces';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

export default function CreateDepartmentScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation(Namespaces.CONTACTS);
  const { instance, models } = useInstance();
  const params = useLocalSearchParams();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedOrgHash, setSelectedOrgHash] = useState<SHA256Hash | ''>((params.organisationHash as SHA256Hash) || '');
  const [organisations, setOrganisations] = useState<Array<{ hash: SHA256Hash; org: Organisation }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Derive the selected organisation name from the selected hash
  const selectedOrgName = selectedOrgHash 
    ? organisations.find(item => item.hash === selectedOrgHash)?.org.name || params.organisationName
    : null;

  // Load organisations from OrganisationModel
  useEffect(() => {
    const loadOrganisations = async () => {
      try {
        setLoadingOrgs(true);
        if (!models?.appModel?.organisationModel) {
          console.error('[CreateDepartment] OrganisationModel not available');
          return;
        }
        
        const orgs = await models.appModel.organisationModel.getAllOrganisations();
        // Transform to the expected structure
        const orgList = orgs.map(item => ({
          hash: item.hash,
          org: item.organisation
        }));
        setOrganisations(orgList);
        
        // If we have a preselected organisation from params, ensure it's selected
        if (params.organisationHash) {
          setSelectedOrgHash(params.organisationHash as SHA256Hash);
        }
      } catch (error) {
        console.error('[CreateDepartment] Error loading organisations:', error);
      } finally {
        setLoadingOrgs(false);
      }
    };
    
    loadOrganisations();
  }, [params.organisationHash]);

  const handleCreate = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Department name is required');
      return;
    }

    if (!selectedOrgHash) {
      setError('Please select an organisation');
      return;
    }

    if (!models?.appModel?.organisationModel) {
      setError('System not ready. Please try again.');
      return;
    }

    setIsLoading(true);

    try {
      // Use OrganisationModel to create the department
      const departmentHash = await models.appModel.organisationModel.createDepartment(
        selectedOrgHash,
        name.trim(),
        description.trim() || undefined
      );
      
      console.log('[CreateDepartment] Department created:', name.trim(), 'with hash:', departmentHash);
      
      // Navigate back immediately
      router.back();
    } catch (err) {
      console.error('[CreateDepartment] Error creating department:', err);
      setError('Failed to create department. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Create Department',
          headerStyle: {
            backgroundColor: theme.colors.surface,
          },
          headerTintColor: theme.colors.onSurface,
        }}
      />
      
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.contentContainer}
      >
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.title}>New Department</Title>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              {selectedOrgName 
                ? `Create a new department in ${selectedOrgName}`
                : 'Create a new department within an organisation'}
            </Text>

            <View style={styles.formSection}>
              {!params.organisationName && (
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                  Select Organisation *
                </Text>
              )}
              
              {params.organisationName ? (
                <View style={styles.selectedOrg}>
                  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Organisation</Text>
                  <Text style={{ color: theme.colors.primary, fontSize: 16 }}>{selectedOrgName}</Text>
                </View>
              ) : loadingOrgs ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading organisations...</Text>
              ) : organisations.length === 0 ? (
                <View>
                  <Text style={{ color: theme.colors.error, marginBottom: 8 }}>
                    No organisations found. Please create an organisation first.
                  </Text>
                  <Button
                    mode="outlined"
                    onPress={() => router.push('/(screens)/devices/create-organisation')}
                    textColor={theme.colors.primary}
                  >
                    Create Organisation
                  </Button>
                </View>
              ) : (
                <RadioButton.Group 
                  onValueChange={setSelectedOrgHash} 
                  value={selectedOrgHash}
                >
                  {organisations.map((item) => (
                    <RadioButton.Item
                      key={item.hash}
                      label={item.org.name}
                      value={item.hash}
                      style={styles.radioItem}
                      labelStyle={{ color: theme.colors.onSurface }}
                    />
                  ))}
                </RadioButton.Group>
              )}

              <TextInput
                label="Department Name *"
                value={name}
                onChangeText={setName}
                mode="outlined"
                placeholder="Enter department name"
                error={!!error && !name.trim()}
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
                disabled={organisations.length === 0}
              />
              
              <TextInput
                label="Description"
                value={description}
                onChangeText={setDescription}
                mode="outlined"
                placeholder="Enter description (optional)"
                multiline
                numberOfLines={3}
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
                disabled={organisations.length === 0}
              />

              {error && (
                <HelperText type="error" visible={true}>
                  {error}
                </HelperText>
              )}
            </View>

            <View style={styles.buttonContainer}>
              <Button
                mode="outlined"
                onPress={() => router.back()}
                disabled={isLoading}
                style={styles.button}
                textColor={theme.colors.primary}
              >
                Cancel
              </Button>
              
              <Button
                mode="contained"
                onPress={handleCreate}
                loading={isLoading}
                disabled={isLoading || !name.trim() || !selectedOrgHash || organisations.length === 0}
                style={styles.button}
                buttonColor={theme.colors.primary}
              >
                Create Department
              </Button>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  selectedOrg: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  input: {
    marginBottom: 16,
    marginTop: 16,
  },
  radioItem: {
    paddingVertical: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    minWidth: 120,
  },
});