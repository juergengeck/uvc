import { SettingsProvider } from '@refinio/settings.core';
import { UvcApp } from '@uvc/uvc.ui';
import { useMemo } from 'react';

import { ElectronUvcPlatform } from './platform/ElectronUvcPlatform';
import { IPCSettingsStorage } from './storage/IPCSettingsStorage';
import { DevicesView } from './views/DevicesView';

export default function App() {
  const platform = useMemo(() => new ElectronUvcPlatform(window.electronAPI), []);
  const settingsStorage = useMemo(() => new IPCSettingsStorage(window.electronAPI), []);

  return (
    <SettingsProvider storage={settingsStorage}>
      <UvcApp DevicesView={DevicesView} platform={platform} />
    </SettingsProvider>
  );
}
