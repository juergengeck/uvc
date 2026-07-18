import assert from 'node:assert/strict';
import test from 'node:test';

import {SettingsRegistry} from '@refinio/settings.core';
import {
  DEFAULT_UVC_DEVICE_SETTINGS,
  DEFAULT_UVC_COMM_SERVER_URL,
  DEFAULT_UVC_NETWORK_SETTINGS,
  DEFAULT_UVC_UI_SETTINGS,
  UvcDeviceSettingsSection,
  UvcNetworkSettingsSection,
  UvcUiSettingsSection,
  getUvcDeviceSettingsDefaults,
  registerUvcSettingsSections,
} from '../uvcSettingsSections.ts';

test('UVC settings sections own defaults, validation, and registration', () => {
  assert.deepEqual(DEFAULT_UVC_DEVICE_SETTINGS, {
    discoveryEnabled: false,
    discoveryPort: 49497,
    discoveryBroadcastInterval: 30000,
    autoConnect: false,
    addOnlyConnectedDevices: false,
    defaultDataPresentation: {$type$: 'ESP32DataPresentation', format: 'json'},
  });
  assert.deepEqual(DEFAULT_UVC_NETWORK_SETTINGS, {
    commServerUrl: 'wss://api.glue.one/comm',
    eddaDomain: 'edda.dev.refinio.one',
    headlessAuthorityUrl: 'http://uvc-pi.local:3000',
    autoConnect: false,
  });
  assert.equal(DEFAULT_UVC_COMM_SERVER_URL, 'wss://api.glue.one/comm');
  assert.deepEqual(DEFAULT_UVC_UI_SETTINGS, {darkMode: false, language: 'en'});

  const deviceDefaults = getUvcDeviceSettingsDefaults();
  deviceDefaults.defaultDataPresentation.format = 'text';
  assert.equal(DEFAULT_UVC_DEVICE_SETTINGS.defaultDataPresentation.format, 'json');

  assert.deepEqual(
    UvcDeviceSettingsSection.fields.map(field => field.key),
    [
      'discoveryEnabled',
      'discoveryPort',
      'discoveryBroadcastInterval',
      'autoConnect',
      'addOnlyConnectedDevices',
      'defaultDataPresentation',
    ],
  );
  assert.deepEqual(
    [...SettingsRegistry.validateSection('missing', {})],
    [],
  );

  try {
    registerUvcSettingsSections();
    registerUvcSettingsSections();
    assert.equal(SettingsRegistry.getSection('devices'), UvcDeviceSettingsSection);
    assert.equal(SettingsRegistry.getSection('network'), UvcNetworkSettingsSection);
    assert.equal(SettingsRegistry.getSection('ui'), UvcUiSettingsSection);
    assert.equal(
      SettingsRegistry.validateSection('devices', {discoveryPort: 0}).get('discoveryPort'),
      'Port must be an integer between 1 and 65535',
    );
    assert.equal(
      SettingsRegistry.validateSection('network', {commServerUrl: 'https://invalid'}).get('commServerUrl'),
      'URL must use ws: or wss:',
    );
    assert.equal(
      SettingsRegistry.validateSection('ui', {language: 'es'}).get('language'),
      'Language must be de, en, or fr',
    );
  } finally {
    SettingsRegistry.unregisterSection('devices');
    SettingsRegistry.unregisterSection('network');
    SettingsRegistry.unregisterSection('ui');
  }
});
