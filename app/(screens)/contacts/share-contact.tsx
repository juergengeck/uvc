import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Share, ScrollView } from 'react-native';
import { Button, useTheme, Text, Divider } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { InviteManager } from '@src/models/contacts/InviteManager';
import InviteQRCode from '@src/components/contacts/InviteQRCode';
import Constants from 'expo-constants';

export default function ShareContactScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { instance } = useInstance();
  const [isSharing, setIsSharing] = useState(false);

  // Share invite as deep link
  const handleShareDeepLink = useCallback(async () => {
    if (!instance?.inviteManager) return;
    
    setIsSharing(true);
    try {
      const deepLink = await instance.inviteManager.generateDeepLink();
      await Share.share({
        message: `${t('contacts:share_contact.share_message')}\n${deepLink}`,
        url: deepLink,
      });
    } catch (error) {
      console.error('Failed to share deep link:', error);
    } finally {
      setIsSharing(false);
    }
  }, [instance?.inviteManager, t]);

  // Share invite as text
  const handleShareText = useCallback(async () => {
    if (!instance?.inviteManager) return;
    
    setIsSharing(true);
    try {
      const textInvite = await instance.inviteManager.generateTextInvite();
      await Share.share({
        message: textInvite,
      });
    } catch (error) {
      console.error('Failed to share text invite:', error);
    } finally {
      setIsSharing(false);
    }
  }, [instance?.inviteManager, t]);

  // Return to the contacts list
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: t('contacts:share_contact.title'),
          headerBackTitle: t('common:actions.back'),
        }}
      />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.description, { color: theme.colors.onBackground }]}>
          {t('contacts:share_contact.description')}
        </Text>

        {instance?.inviteManager && (
          <View style={styles.qrContainer}>
            <InviteQRCode 
              inviteManager={instance.inviteManager} 
              size={250}
            />
          </View>
        )}

        <Divider style={styles.divider} />
        
        <View style={styles.buttonContainer}>
          <Button
            mode="contained"
            onPress={handleShareDeepLink}
            loading={isSharing}
            disabled={!instance?.inviteManager || isSharing}
            style={styles.button}
            icon="link"
          >
            {t('contacts:share_contact.share_link')}
          </Button>

          <Button
            mode="outlined"
            onPress={handleShareText}
            loading={isSharing}
            disabled={!instance?.inviteManager || isSharing}
            style={styles.button}
            icon="text"
          >
            {t('contacts:share_contact.share_text')}
          </Button>

          <Button
            mode="text"
            onPress={handleClose}
            style={styles.button}
          >
            {t('common:actions.close')}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    alignItems: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  divider: {
    width: '100%',
    marginVertical: 24,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    width: '100%',
  },
}); 