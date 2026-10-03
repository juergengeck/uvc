/**
 * uvc platform seams for @refinio/esp32.host.
 *
 * The ESP32 host adapter (moved to ../devices 2026-10-03, formerly
 * src/models/network/{interfaces,QuicModel,QuicVCConnectionManager,
 * QuicConnectionManager,deviceTypes,esp32,transport,vc,journal} plus
 * src/recipes/device, src/types/device-control-recipes and the
 * microdata/byteEncoding/profiler utils) is platform-agnostic: it never
 * touches sockets or platform crypto directly. uvc injects its React Native
 * implementations here; every consumer passes them explicitly at
 * construction so a missing seam fails fast instead of half-working.
 */
import * as expoCrypto from 'expo-crypto';
import type {
  Esp32Crypto,
  Esp32UdpTransport,
  QuicTransportOptions,
  UdpSocket,
  UdpSocketOptions,
} from '@refinio/esp32.host';
import {UdpModel} from './UdpModel';

/**
 * Expo-based digest provider for the adapter's key derivation.
 * Same primitive the adapter used before extraction
 * (expo-crypto digestStringAsync over the given string).
 */
export const esp32Crypto: Esp32Crypto = {
  sha256Base64: (data: string): Promise<string> =>
    expoCrypto.digestStringAsync(expoCrypto.CryptoDigestAlgorithm.SHA256, data, {
      encoding: expoCrypto.CryptoEncoding.BASE64,
    }),
  sha256Hex: (data: string): Promise<string> =>
    expoCrypto.digestStringAsync(expoCrypto.CryptoDigestAlgorithm.SHA256, data, {
      encoding: expoCrypto.CryptoEncoding.HEX,
    }),
};

let udpTransport: Esp32UdpTransport | undefined;

/**
 * UdpModel-backed UDP transport for the adapter. Singleton: UdpModel
 * itself is a singleton, so repeated calls return the same adapter.
 */
export function getEsp32UdpTransport(): Esp32UdpTransport {
  if (!udpTransport) {
    const model = UdpModel.getInstance();
    udpTransport = {
      isInitialized: (): boolean => model.isInitialized(),
      init: (): Promise<boolean> => model.init(),
      createSocket: (options: UdpSocketOptions): Promise<UdpSocket> =>
        model.createSocket(options) as unknown as Promise<UdpSocket>,
      forceReset: (): Promise<void> => UdpModel.forceReset(),
      forceReleasePort: (port: number): Promise<{released: boolean; closedCount: number}> =>
        UdpModel.forceReleasePort(port),
      releaseInstance: (): void => UdpModel.releaseInstance(),
    };
  }
  return udpTransport;
}

/**
 * QuicTransportOptions with the uvc UDP seam injected. Pass the result to
 * QuicModel.getInstance/ensureInitialized or new UdpServiceTransport.
 * QuicModel consumes options only at first instantiation, so every call
 * site passes them: whichever runs first wins.
 */
export function esp32QuicOptions(extra?: QuicTransportOptions): QuicTransportOptions {
  return {udpTransport: getEsp32UdpTransport(), ...extra};
}
