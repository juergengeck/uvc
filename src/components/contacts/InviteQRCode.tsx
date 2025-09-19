/**
 * InviteQRCode Component
 * 
 * Displays a QR code for sharing contact information
 * Based on the pattern in one.leute but adapted for React Native
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from 'react-native-paper';
import { InviteManager } from '@src/models/contacts/InviteManager';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

interface InviteQRCodeProps {
  /**
   * The invite manager instance
   */
  inviteManager: InviteManager;
  
  /**
   * Size of the QR code (square)
   * @default 200
   */
  size?: number;
  
  /**
   * Logo to display in the center of the QR code
   * @optional
   */
  logo?: string;
}

export default function InviteQRCode({ 
  inviteManager, 
  size = 200, 
  logo 
}: InviteQRCodeProps) {
  const [inviteData, setInviteData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const { t } = useTranslation();

  const loadInviteData = async () => {
      try {
        setIsLoading(true);
      setError(null);
        const data = await inviteManager.generateInviteData();
        setInviteData(data);
      console.log('[InviteQRCode] Generated new invitation data');
      } catch (err) {
        console.error('Failed to generate invite data:', err);
        setError(t('contacts:invite.generation_error'));
      } finally {
        setIsLoading(false);
      }
  };

  useEffect(() => {
    loadInviteData();
  }, [inviteManager, t]);

  // Auto-refresh invitation data every 5 minutes to prevent token expiration issues
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoading && !error) {
        console.log('[InviteQRCode] Auto-refreshing invitation data to prevent token expiration');
        loadInviteData();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isLoading, error]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.onBackground }]}>
          {t('contacts:invite.generating')}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {inviteData ? (
        <View style={styles.qrContainer}>
          <QRCode
            value={inviteData}
            size={size}
            color={theme.colors.onBackground}
            backgroundColor={theme.colors.background}
            logo={logo}
            logoSize={size * 0.2}
            logoBackgroundColor="white"
          />
          <Text style={[styles.scanText, { color: theme.colors.onBackground }]}>
            {t('contacts:invite.scan_to_connect')}
          </Text>
          <Text style={[styles.noteText, { color: theme.colors.onSurfaceVariant }]}>
            Each invitation can only be used once
          </Text>
          <TouchableOpacity 
            style={[styles.refreshButton, { backgroundColor: theme.colors.primary }]}
            onPress={loadInviteData}
            disabled={isLoading}
          >
            <Ionicons name="refresh" size={20} color={theme.colors.onPrimary} />
            <Text style={[styles.refreshButtonText, { color: theme.colors.onPrimary }]}>
              Generate New Code
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          {t('contacts:invite.no_data')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  scanText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  noteText: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 16,
  },
  refreshButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
}); 