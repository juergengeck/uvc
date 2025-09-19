export interface BLEError {
  code: string;
  message: string;
  nativeError?: any;
}

export interface BLECharacteristic {
  uuid: string;
  properties: CharacteristicProperty[];
  value?: any;
}

export type CharacteristicProperty = 
  | 'read'
  | 'write'
  | 'writeWithoutResponse'
  | 'notify'
  | 'indicate';

export interface BLEService {
  uuid: string;
  name?: string;
  characteristics: BLECharacteristic[];
}

export interface DataPacket {
  command: number;
  data: Buffer;
  timestamp: Date;
  checksum?: number;
}

export interface ConnectionOptions {
  autoConnect?: boolean;
  timeout?: number;
  mtu?: number;
  connectionPriority?: 'low' | 'balanced' | 'high';
}

export interface ScanOptions {
  allowDuplicates?: boolean;
  scanMode?: 'lowPower' | 'balanced' | 'lowLatency';
  matchMode?: 'aggressive' | 'sticky';
  callbackType?: 'allMatches' | 'firstMatch' | 'matchLost';
}

export enum BLEState {
  Unknown = 'Unknown',
  Resetting = 'Resetting',
  Unsupported = 'Unsupported',
  Unauthorized = 'Unauthorized',
  PoweredOff = 'PoweredOff',
  PoweredOn = 'PoweredOn'
}

export interface BLEPermissions {
  bluetooth: boolean;
  location: boolean;
}

export interface WiFiCredentials {
  ssid: string;
  password: string;
  security?: 'open' | 'wep' | 'wpa' | 'wpa2' | 'wpa3';
}

export interface WiFiStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'failed';
  ssid?: string;
  ip?: string;
  rssi?: number;
  error?: string;
}