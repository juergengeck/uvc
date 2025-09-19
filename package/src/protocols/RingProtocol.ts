/**
 * R02 Ring Protocol Implementation
 * 
 * This file contains the protocol definitions for communicating with R02 smart rings
 * Based on the 16-byte packet structure with checksum validation
 */

export enum CommandType {
  HEART_RATE = 0x01,
  SPO2 = 0x02,
  TEMPERATURE = 0x03,
  STEPS = 0x04,
  BATTERY = 0x05,
  SLEEP = 0x06,
  SLEEP_HISTORY = 0x07,
  SET_TIME = 0x08,
  DEVICE_INFO = 0x09,
  RESET = 0x0A,
  CALIBRATE = 0x0B
}

export enum ResponseStatus {
  SUCCESS = 0x00,
  ERROR = 0x01,
  INVALID_COMMAND = 0x02,
  BUSY = 0x03,
  NOT_READY = 0x04
}

export enum SleepQuality {
  AWAKE = 0x00,
  LIGHT = 0x01,
  DEEP = 0x02,
  REM = 0x03
}

export interface SleepRecord {
  startTime: Date;
  endTime: Date;
  quality: SleepQuality;
}

export class RingPacket {
  private static readonly PACKET_SIZE = 16;
  private static readonly HEADER = 0xAA;
  private static readonly FOOTER = 0x55;
  
  private buffer: Buffer;

  constructor(command: CommandType, data?: Buffer) {
    this.buffer = Buffer.alloc(RingPacket.PACKET_SIZE);
    this.buffer[0] = RingPacket.HEADER;
    this.buffer[1] = command;
    
    if (data) {
      const dataLength = Math.min(data.length, 12);
      this.buffer[2] = dataLength;
      data.copy(this.buffer, 3, 0, dataLength);
    } else {
      this.buffer[2] = 0;
    }
    
    this.buffer[15] = RingPacket.FOOTER;
    this.buffer[14] = this.calculateChecksum();
  }

  static fromBuffer(buffer: Buffer): RingPacket | null {
    if (buffer.length !== RingPacket.PACKET_SIZE) {
      return null;
    }
    
    if (buffer[0] !== RingPacket.HEADER || buffer[15] !== RingPacket.FOOTER) {
      return null;
    }
    
    const packet = new RingPacket(buffer[1] as CommandType);
    buffer.copy(packet.buffer);
    
    if (!packet.isValid()) {
      return null;
    }
    
    return packet;
  }

  getCommand(): CommandType {
    return this.buffer[1] as CommandType;
  }

  getData(): Buffer {
    const length = this.buffer[2];
    return this.buffer.slice(3, 3 + length);
  }

  getBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  isValid(): boolean {
    return this.buffer[14] === this.calculateChecksum();
  }

  private calculateChecksum(): number {
    let sum = 0;
    for (let i = 1; i < 14; i++) {
      sum += this.buffer[i];
    }
    return sum & 0xFF;
  }
}

export class ProtocolHelper {
  static parseHeartRate(data: Buffer): { bpm: number; confidence: number } | null {
    if (data.length < 2) return null;
    return {
      bpm: data[0],
      confidence: data[1]
    };
  }

  static parseSpO2(data: Buffer): { percentage: number; confidence: number } | null {
    if (data.length < 2) return null;
    return {
      percentage: data[0],
      confidence: data[1]
    };
  }

  static parseSteps(data: Buffer): number | null {
    if (data.length < 2) return null;
    return (data[0] << 8) | data[1];
  }

  static parseBattery(data: Buffer): number | null {
    if (data.length < 1) return null;
    return data[0];
  }

  static parseSleepQuality(data: Buffer): SleepQuality | null {
    if (data.length < 1) return null;
    return data[0] as SleepQuality;
  }

  static createTimestamp(date: Date = new Date()): Buffer {
    const timestamp = Math.floor(date.getTime() / 1000);
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(timestamp, 0);
    return buffer;
  }
}