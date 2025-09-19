import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import DeviceListScreen from '@src/screens/DeviceListScreen';

/**
 * Device List Route
 * 
 * Shows discovered devices on the network
 */
export default function DevicesScreen() {
  const { t } = useTranslation();
  
  return (
    <>
      <Stack.Screen 
        options={{
          title: t('settings.network.devices.title', { defaultValue: 'Discovered Devices' }),
          headerBackTitle: t('common:back', { defaultValue: 'Back' }),
        }} 
      />
      <DeviceListScreen />
    </>
  );
}