/**
 * Google Fit type definitions
 */

export interface GoogleFitConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
}

export interface GoogleFitDataSource {
  dataStreamId: string;
  type: GoogleFitDataType;
  application?: string;
  device?: GoogleFitDevice;
}

export enum GoogleFitDataType {
  STEPS = 'com.google.step_count.delta',
  HEART_RATE = 'com.google.heart_rate.bpm',
  CALORIES = 'com.google.calories.expended',
  DISTANCE = 'com.google.distance.delta',
  ACTIVITY = 'com.google.activity.segment',
  WEIGHT = 'com.google.weight',
  HEIGHT = 'com.google.height',
  BLOOD_PRESSURE = 'com.google.blood_pressure',
  BLOOD_GLUCOSE = 'com.google.blood_glucose',
  SLEEP = 'com.google.sleep.segment',
}

export interface GoogleFitDevice {
  manufacturer?: string;
  model?: string;
  type: GoogleFitDeviceType;
  uid?: string;
  version?: string;
}

export enum GoogleFitDeviceType {
  UNKNOWN = 0,
  PHONE = 1,
  TABLET = 2,
  WATCH = 3,
  SCALE = 4,
  FITNESS_BAND = 5,
}

export interface GoogleFitDataPoint {
  startTimeNanos: string;
  endTimeNanos: string;
  dataTypeName: string;
  originDataSourceId?: string;
  value: GoogleFitValue[];
}

export interface GoogleFitValue {
  intVal?: number;
  fpVal?: number;
  stringVal?: string;
  mapVal?: Array<{
    key: string;
    value: GoogleFitValue;
  }>;
}

export interface GoogleFitSession {
  id: string;
  name?: string;
  description?: string;
  startTimeMillis: string;
  endTimeMillis: string;
  modifiedTimeMillis?: string;
  application?: string;
  activityType: number;
}

export interface GoogleFitAggregateRequest {
  aggregateBy: Array<{
    dataTypeName?: string;
    dataSourceId?: string;
  }>;
  bucketByTime?: {
    durationMillis: number;
  };
  bucketBySession?: {
    minDurationMillis?: number;
  };
  bucketByActivityType?: {
    minDurationMillis?: number;
  };
  bucketByActivitySegment?: {
    minDurationMillis?: number;
  };
  startTimeMillis: string;
  endTimeMillis: string;
}

export interface GoogleFitAggregateResponse {
  bucket: Array<{
    startTimeMillis: string;
    endTimeMillis: string;
    dataset: Array<{
      dataSourceId: string;
      point: GoogleFitDataPoint[];
    }>;
    session?: GoogleFitSession;
    activity?: number;
  }>;
}

export interface GoogleFitAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleFitError {
  error: {
    code: number;
    message: string;
    status?: string;
    details?: any[];
  };
}