import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DeviceListScreen from '@src/screens/DeviceListScreen';

/**
 * Device List Route
 * 
 * Wraps the DeviceListScreen component with a header
 */
export default function DeviceListRoute() {
  const { t } = useTranslation();
  
  return (
    <>
      <Stack.Screen
        options={{
          title: t('devices.title', { defaultValue: 'Device List' }),
          headerBackTitle: t('common.back', { defaultValue: 'Back' }),
        }}
      />
      <DeviceListScreen />
    </>
  );
} 