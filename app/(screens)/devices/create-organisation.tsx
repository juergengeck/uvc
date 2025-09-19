import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, useTheme, Text, HelperText, Card, Title } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { Namespaces } from '@src/i18n/namespaces';
import type { Organisation } from '@OneObjectInterfaces';

export default function CreateOrganisationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation(Namespaces.CONTACTS);
  const { instance, models } = useInstance();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Organisation name is required');
      return;
    }

    if (!models?.appModel?.organisationModel) {
      setError('System not ready. Please try again.');
      return;
    }

    setIsLoading(true);

    try {
      // Use OrganisationModel to create the organisation
      const organisationHash = await models.appModel.organisationModel.createOrganisation(
        name.trim(),
        description.trim() || undefined
      );

      console.log('[CreateOrganisation] Organisation created with hash:', organisationHash);

      // Navigate back to devices view
      router.back();
    } catch (err) {
      console.error('[CreateOrganisation] Error creating organisation:', err);
      setError('Failed to create organisation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Create Organisation',
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
            <Title style={styles.title}>New Organisation</Title>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              Create a new organisation to manage departments and devices
            </Text>

            <View style={styles.formSection}>
              <TextInput
                label="Organisation Name *"
                value={name}
                onChangeText={setName}
                mode="outlined"
                placeholder="Enter organisation name"
                error={!!error && !name.trim()}
                style={styles.input}
                outlineColor={theme.colors.primary}
                activeOutlineColor={theme.colors.primary}
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
                disabled={isLoading || !name.trim()}
                style={styles.button}
                buttonColor={theme.colors.primary}
              >
                Create Organisation
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
  input: {
    marginBottom: 16,
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