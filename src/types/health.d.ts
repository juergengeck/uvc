/**
 * Health Data Type Definitions
 */

// Import ring device types
import type { RingDeviceData, RingMeasurementData, RingSleepData } from '@/models/health/ring/types';
import type { RingPacket, RingCommand, RingResponse } from '@/models/health/ring/packet';

// Core health metric types
export interface HealthMetric {
    $type$: 'health_metric';
    id: string;
    timestamp: Date;
    value: number;
    type: string;
    unit?: string;
    source?: string;
}

export interface DeviceInfo {
    $type$: 'health_device_info';
    id: string;
    name: string;
    type: string;
    lastConnected: string;
    batteryLevel: number;
}

export interface BloodPressure extends HealthMetric {
    systolic: number;
    diastolic: number;
}

export interface BloodPressureData {
    $type$: 'health_blood_pressure';
    systolic: HealthMetric[];
    diastolic: HealthMetric[];
}

export interface HealthData {
    $type$: 'health_data';
    timestamp: string;
    metrics: HealthMetric[];
    steps?: HealthMetric[];
    heartRate?: HealthMetric[];
    sleep?: HealthMetric[];
    weight?: HealthMetric[];
    bodyTemperature?: HealthMetric[];
    bloodPressure?: BloodPressureData;
    ringData?: {
        devices: RingDeviceData[];
        measurements: RingMeasurementData[];
        sleep: RingSleepData[];
    };
}

export interface UnifiedHealthData {
    $type$: 'health_unified_data';
    healthKitData?: HealthData;
    colmi02Data?: HealthData;
    mergedData: HealthData;
    lastUpdated: string;
}

export interface ObservationType {
    $type$: 'health_observation';
    value: number;
    unit: string;
    timestamp: string;
    source: string;
    metadata?: Record<string, any>;
}

// Export module augmentations
declare module '@refinio/one.models/lib/recipes/health/types' {
    export { HealthMetric, BloodPressure, HealthData, UnifiedHealthData, ObservationType };
}

export type {
    HealthMetric,
    BloodPressure,
    HealthData,
    UnifiedHealthData,
    ObservationType
};

// Default export to satisfy module requirements
export default interface HealthTypes {
    HealthMetric: HealthMetric;
    BloodPressure: BloodPressure;
    HealthData: HealthData;
    UnifiedHealthData: UnifiedHealthData;
    ObservationType: ObservationType;
}