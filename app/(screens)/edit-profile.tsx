import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { useInstance } from '@src/providers/app/useInstance';

export default function EditProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { instance } = useInstance();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!instance?.propertyTree) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await instance.propertyTree.setValue('profile.name', name);
      await instance.propertyTree.setValue('profile.email', email);
      router.back();
    } catch (err) {
      setError(t('errors.saveFailed'));
      console.error('[EditProfile] Failed to save profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {error && (
        <Text style={[styles.error, { color: theme.colors.error }]}>
          {error}
        </Text>
      )}

      <TextInput
        label={t('profile.name')}
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
      />

      <TextInput
        label={t('profile.email')}
        value={email}
        onChangeText={setEmail}
        mode="outlined"
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
      />

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleSave}
          loading={isLoading}
          disabled={isLoading}
          style={styles.button}
        >
          {t('common.save')}
        </Button>
        
        <Button
          mode="outlined"
          onPress={() => router.back()}
          disabled={isLoading}
          style={styles.button}
        >
          {t('common.cancel')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  input: {
    marginBottom: 16,
  },
  buttonContainer: {
    gap: 8,
  },
  button: {
    marginBottom: 8,
  },
  error: {
    marginBottom: 16,
    textAlign: 'center',
  },
}); 