import {Stack} from 'expo-router';
import React from 'react';

import DevicesScreen from '../../(tabs)/contacts';

/** Devices are a Settings resource, presented in the Settings stack. */
export default function SettingsDevicesScreen() {
  return (
    <>
      <Stack.Screen options={{title: 'Devices'}} />
      <DevicesScreen />
    </>
  );
}
