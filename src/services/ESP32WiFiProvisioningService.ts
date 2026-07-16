import type {Device, Subscription} from 'react-native-ble-plx';

import {btleService} from './BLETurboModule';
import {
  decodeESP32WiFiProvisioningResponse,
  encodeESP32WiFiProvisioningRequest,
  ESP32_WIFI_BLE,
  type ESP32WiFiProvisioningResult,
} from './ESP32WiFiProvisioningProtocol';

export * from './ESP32WiFiProvisioningProtocol';

/** Provisions network access over the ESP32's unowned, proximity-only BLE bootstrap service. */
export class ESP32WiFiProvisioningService {
  async provision(deviceId: string, ssid: string, password: string): Promise<ESP32WiFiProvisioningResult> {
    if (!await btleService.initialize()) {
      throw new Error('Bluetooth is unavailable');
    }

    let device: Device | undefined;
    let monitor: Subscription | undefined;
    try {
      device = await btleService.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      const response = new Promise<ESP32WiFiProvisioningResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          monitor?.remove();
          reject(new Error('ESP32 did not acknowledge the WiFi credentials'));
        }, 10_000);

        monitor = device!.monitorCharacteristicForService(
          ESP32_WIFI_BLE.service,
          ESP32_WIFI_BLE.response,
          (error, characteristic) => {
            if (error) {
              clearTimeout(timeout);
              reject(error);
              return;
            }
            if (!characteristic?.value) return;
            try {
              const result = decodeESP32WiFiProvisioningResponse(characteristic.value);
              clearTimeout(timeout);
              monitor?.remove();
              result.success
                ? resolve(result)
                : reject(new Error(result.message ?? `WiFi setup failed: ${result.status}`));
            } catch (decodeError) {
              clearTimeout(timeout);
              reject(decodeError);
            }
          },
        );
      });

      await device.writeCharacteristicWithResponseForService(
        ESP32_WIFI_BLE.service,
        ESP32_WIFI_BLE.request,
        encodeESP32WiFiProvisioningRequest(ssid, password),
      );
      return await response;
    } finally {
      monitor?.remove();
      if (device) {
        await device.cancelConnection().catch(() => undefined);
      }
    }
  }
}

export const esp32WiFiProvisioningService = new ESP32WiFiProvisioningService();
