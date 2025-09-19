/**
 * Type declarations for expo-camera
 */

declare module 'expo-camera' {
  import { Component } from 'react';
  import { ViewProps } from 'react-native';

  export interface CameraProps extends ViewProps {
    type?: number;
    flashMode?: number;
    autoFocus?: boolean | number;
    zoom?: number;
    whiteBalance?: number;
    ratio?: string;
    pictureSize?: string;
    onCameraReady?: () => void;
    onMountError?: (error: any) => void;
    onBarCodeScanned?: (scanningResult: { type: string; data: string }) => void;
    barCodeScannerSettings?: {
      barCodeTypes?: string[];
    };
  }

  export default class Camera extends Component<CameraProps> {
    static Constants: {
      Type: {
        front: number;
        back: number;
      };
      FlashMode: {
        on: number;
        off: number;
        auto: number;
        torch: number;
      };
      AutoFocus: {
        on: number;
        off: number;
      };
      WhiteBalance: {
        auto: number;
        sunny: number;
        cloudy: number;
        shadow: number;
        fluorescent: number;
        incandescent: number;
      };
      BarCodeType: Record<string, string>;
    }

    takePictureAsync(options?: { quality?: number; base64?: boolean; exif?: boolean }): Promise<{ uri: string; width: number; height: number; exif?: any; base64?: string }>;
    pausePreview(): void;
    resumePreview(): void;
    getSupportedRatiosAsync(): Promise<string[]>;
    getAvailablePictureSizesAsync(ratio: string): Promise<string[]>;
  }

  export const BarCodeScanner: {
    Constants: {
      BarCodeType: Record<string, string>;
    };
    requestPermissionsAsync(): Promise<{ status: string; expires: string }>;
    getPermissionsAsync(): Promise<{ status: string; expires: string }>;
  };
} 