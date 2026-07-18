import React from 'react';
import {StyleSheet, View} from 'react-native';
import {ActivityIndicator, Text} from 'react-native-paper';

import {Colors} from '@src/constants/Colors';

/**
 * Visible destination for the authenticated physical integration deep link.
 * The persistent useDeepLinks handler owns execution so it survives routing.
 */
export default function UvcControlIntegrationRoute() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.dark.primary} />
      <Text variant="headlineSmall" style={styles.title}>Running physical device test</Text>
      <Text variant="bodyLarge" style={styles.message}>
        Expo is sending the ESP32 LED read, on, off, restore, and final-read commands through the paired Cube.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 28,
    backgroundColor: Colors.dark.background,
  },
  title: {
    color: Colors.dark.onBackground,
    textAlign: 'center',
  },
  message: {
    color: Colors.dark.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 26,
  },
});
