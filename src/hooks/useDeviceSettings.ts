import {useCallback, useState} from 'react';
import {useSettings} from '@src/providers/app/SettingsProvider';
import {useInstance} from '@src/providers/app/useInstance';
import type {ESP32DeviceSettings} from '@src/types/device';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Person} from '@refinio/one.core/lib/recipes.js';

export function useDeviceSettings() {
  const {
    deviceSettings,
    deviceConfig,
    updateDeviceSettings,
    isLoading,
    error,
  } = useSettings();
  const {instance} = useInstance();
  const [localLoading, setLocalLoading] = useState(false);

  const updateWithLoading = useCallback(async (
    values: Parameters<typeof updateDeviceSettings>[0],
  ) => {
    setLocalLoading(true);
    try {
      await updateDeviceSettings(values);
    } finally {
      setLocalLoading(false);
    }
  }, [updateDeviceSettings]);

  const toggleDiscovery = useCallback(async () => {
    await updateWithLoading({discoveryEnabled: !deviceSettings.discoveryEnabled});
  }, [deviceSettings.discoveryEnabled, updateWithLoading]);

  const toggleAutoConnect = useCallback(async () => {
    await updateWithLoading({autoConnect: !deviceSettings.autoConnect});
  }, [deviceSettings.autoConnect, updateWithLoading]);

  const toggleAddOnlyConnectedDevices = useCallback(async () => {
    await updateWithLoading({
      addOnlyConnectedDevices: !deviceSettings.addOnlyConnectedDevices,
    });
  }, [deviceSettings.addOnlyConnectedDevices, updateWithLoading]);

  const setDiscoveryPort = useCallback(async (port: number) => {
    await updateWithLoading({discoveryPort: port});
  }, [updateWithLoading]);

  const removeDevice = useCallback(async (deviceId: string) => {
    if (!instance.deviceModel) {
      throw new Error('DeviceModel is not initialized');
    }
    setLocalLoading(true);
    try {
      await instance.deviceModel.removeDeviceOwnership(deviceId);
    } finally {
      setLocalLoading(false);
    }
  }, [instance.deviceModel]);

  const updateDevice = useCallback(async (
    deviceId: string,
    device: Partial<ESP32DeviceSettings>,
  ) => {
    if (!instance.deviceModel) {
      throw new Error('DeviceModel is not initialized');
    }
    if (device.enabled !== undefined) {
      throw new Error('Per-device enabled state is not part of the DeviceModel schema');
    }

    const values: {displayName?: string; autoConnect?: boolean} = {};
    if (device.name !== undefined) {
      values.displayName = device.name;
    }
    if (device.autoConnect !== undefined) {
      values.autoConnect = device.autoConnect;
    }
    if (Object.keys(values).length === 0) {
      return;
    }

    setLocalLoading(true);
    try {
      await instance.deviceModel.updateDeviceSettings(deviceId, values);
    } finally {
      setLocalLoading(false);
    }
  }, [instance.deviceModel]);

  const addDevice = useCallback(async (device: ESP32DeviceSettings) => {
    if (!instance.deviceModel) {
      throw new Error('DeviceModel is not initialized');
    }
    await instance.deviceModel.registerDeviceOwnership(device.id);
  }, [instance.deviceModel]);

  const associateDeviceWithPerson = useCallback(async (
    deviceId: string,
    personId: SHA256IdHash<Person>,
  ) => {
    const ownPersonId = instance.settingsStorage.getOwnerPersonIdHash();
    if (personId !== ownPersonId) {
      throw new Error('DeviceModel currently supports ownership by the active person only');
    }
    if (!instance.deviceModel) {
      throw new Error('DeviceModel is not initialized');
    }
    await instance.deviceModel.registerDeviceOwnership(deviceId);
  }, [instance.deviceModel, instance.settingsStorage]);

  const disassociateDeviceFromPerson = removeDevice;
  const discoveryModel = instance.deviceDiscoveryModel;

  return {
    deviceSettings,
    deviceConfig,
    isLoading: isLoading || localLoading,
    error,
    updateDeviceSettings,
    toggleDiscovery,
    toggleAutoConnect,
    toggleAddOnlyConnectedDevices,
    setDiscoveryPort,
    addDevice,
    updateDevice,
    removeDevice,
    associateDeviceWithPerson,
    disassociateDeviceFromPerson,
    getDevices: discoveryModel ? () => discoveryModel.getDevices() : undefined,
    getDevice: discoveryModel ? (deviceId: string) => discoveryModel.getDevice(deviceId) : undefined,
    getDevicesForPerson: discoveryModel
      ? (personId: SHA256IdHash<Person>) => discoveryModel.getDevices().filter(
        device => device.owner === personId,
      )
      : undefined,
  };
}
