import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, useTheme, Text, HelperText, Card, Title, RadioButton } from 'react-native-paper';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type {UvcRoomKind} from '@refinio/uvc.core';
import { buildDepartmentOptions } from '@src/utils/organisationOptions';
import type { DepartmentOption } from '@src/utils/organisationOptions';

export default function CreateRoomScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    departmentHash?: string;
    departmentName?: string;
    organisationHash?: string;
  }>();
  const { t } = useTranslation(Namespaces.CONTACTS);
  const { instance, models } = useInstance();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roomKind, setRoomKind] = useState<UvcRoomKind>('treatment-room');
  const [selectedDepartment, setSelectedDepartment] = useState(params.departmentHash ?? '');
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // Reload departments every time the screen gains focus: the user may have
  // just created one on the pushed create-department screen, and a mount-only
  // load would keep showing the stale (empty) list with the button disabled.
  const loadDepartments = useCallback(async () => {
    try {
      setLoadingDepts(true);
      setError(null);

      if (!models?.appModel?.organisationModel) {
        console.error('[CreateRoom] OrganisationModel not available');
        setLoadingDepts(false);
        return;
      }

      // Check if OrganisationModel is properly initialized
      if (models.appModel.organisationModel.currentState !== 'Initialised') {
        console.warn('[CreateRoom] OrganisationModel not yet initialized, state:', models.appModel.organisationModel.currentState);
        // Wait a bit and retry
        setTimeout(() => {
          if (models?.appModel?.organisationModel?.currentState === 'Initialised') {
            loadDepartments();
          } else {
            setLoadingDepts(false);
          }
        }, 2000);
        return;
      }

      // Get all departments and organisations
      const [depts, orgs] = await Promise.all([
        models.appModel.organisationModel.getAllDepartments(),
        models.appModel.organisationModel.getAllOrganisations()
      ]);

      const deptOptions: DepartmentOption[] = buildDepartmentOptions(
        depts.map(item => ({ hash: item.hash, department: { name: item.department.name, organisation: item.department.organisation } })),
        orgs.map(org => ({ hash: org.hash, organisation: { name: org.organisation.name } })),
      );

      console.log('[CreateRoom] Total department options:', deptOptions.length);
      setDepartments(deptOptions);
    } catch (error) {
      console.error('[CreateRoom] Error loading departments:', error);
    } finally {
      setLoadingDepts(false);
    }
  }, [models?.appModel?.organisationModel]);

  useFocusEffect(
    useCallback(() => {
      if (models?.appModel?.organisationModel) {
        loadDepartments();
      }
    }, [models?.appModel?.organisationModel, loadDepartments]),
  );

  const handleCreate = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Room name is required');
      return;
    }

    if (!selectedDepartment) {
      setError('Please select a department');
      return;
    }

    if (!models?.appModel?.organisationModel) {
      setError('System not ready. Please try again.');
      return;
    }

    setIsLoading(true);

    try {
      // Use OrganisationModel to create the room
      const roomHash = await models.appModel.organisationModel.createRoom(
        selectedDepartment as SHA256Hash,
        name.trim(),
        description.trim() || undefined,
        roomKind,
      );
      
      console.log('[CreateRoom] Room created:', name.trim(), 'with hash:', roomHash);
      
      // Navigate back immediately
      router.back();
    } catch (err) {
      console.error('[CreateRoom] Error creating room:', err);
      setError('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Create Room',
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
            <Title style={styles.title}>New Room</Title>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              Create a new room within a department
            </Text>

            <View style={styles.formSection}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Select Department *
              </Text>
              
              {!models?.appModel?.organisationModel ? (
                <View>
                  <Text style={{ color: theme.colors.error, marginBottom: 16 }}>
                    Organization system not ready. Please wait or try refreshing.
                  </Text>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setLoadingDepts(true);
                      // Try to reload departments after a delay
                      setTimeout(() => {
                        if (models?.appModel?.organisationModel) {
                          loadDepartments();
                        } else {
                          setLoadingDepts(false);
                        }
                      }, 1000);
                    }}
                    textColor={theme.colors.primary}
                  >
                    Retry
                  </Button>
                </View>
              ) : loadingDepts ? (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading departments...</Text>
              ) : departments.length === 0 ? (
                <View>
                  <Text style={{ color: theme.colors.error, marginBottom: 16 }}>
                    No departments found. You need to create an organization and department first.
                  </Text>
                  <View style={styles.actionButtons}>
                    <Button
                      mode="outlined"
                      onPress={() => router.push('/(screens)/devices/create-organisation')}
                      textColor={theme.colors.primary}
                      style={styles.actionButton}
                    >
                      Create Organization
                    </Button>
                    <Button
                      mode="outlined"
                      onPress={() => router.push('/(screens)/devices/create-department')}
                      textColor={theme.colors.primary}
                      style={styles.actionButton}
                    >
                      Create Department
                    </Button>
                  </View>
                </View>
              ) : (
                <RadioButton.Group 
                  onValueChange={setSelectedDepartment} 
                  value={selectedDepartment}
                >
                  {departments.map((dept) => (
                    <RadioButton.Item
                      key={dept.hash}
                      label={dept.displayName}
                      value={dept.hash}
                      style={styles.radioItem}
                      labelStyle={{ color: theme.colors.onSurface }}
                    />
                  ))}
                </RadioButton.Group>
              )}

              <TextInput
                label="Room Name *"
                value={name}
                onChangeText={setName}
                mode="outlined"
                placeholder="Enter room name"
                error={!!error && !name.trim()}
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
                disabled={false}
              />

              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Room type</Text>
              <RadioButton.Group
                onValueChange={value => setRoomKind(value as UvcRoomKind)}
                value={roomKind}
              >
                <RadioButton.Item label="Treatment room" value="treatment-room" style={styles.radioItem} />
                <RadioButton.Item label="Bathroom" value="bathroom" style={styles.radioItem} />
                <RadioButton.Item label="Operating room" value="operating-room" style={styles.radioItem} />
                <RadioButton.Item label="Laboratory" value="laboratory" style={styles.radioItem} />
                <RadioButton.Item label="Other" value="other" style={styles.radioItem} />
              </RadioButton.Group>
              
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
                disabled={false}
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
                disabled={isLoading || !name.trim() || !selectedDepartment || !models?.appModel?.organisationModel}
                style={styles.button}
                buttonColor={theme.colors.primary}
              >
                Create Room
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
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  actionButton: {
    flex: 1,
    minWidth: 140,
  },
});
