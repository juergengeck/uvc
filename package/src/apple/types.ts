/**
 * Apple HealthKit data types and interfaces
 */

export interface AppleHealthData {
  id: string;
  type: string;
  value: number;
  unit: string;
  startDate: Date;
  endDate: Date;
  sourceName?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
}

export interface AppleHealthPermissions {
  read: string[];
  write: string[];
}

export interface AppleHealthOptions {
  permissions: AppleHealthPermissions;
  date?: Date;
  unit?: string;
  startDate?: Date;
  endDate?: Date;
  ascending?: boolean;
  limit?: number;
}

/**
 * Apple HealthKit quantity types
 */
export const AppleHealthQuantityTypes = {
  // Activity
  StepCount: 'HKQuantityTypeIdentifierStepCount',
  DistanceWalkingRunning: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  DistanceCycling: 'HKQuantityTypeIdentifierDistanceCycling',
  BasalEnergyBurned: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  ActiveEnergyBurned: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  FlightsClimbed: 'HKQuantityTypeIdentifierFlightsClimbed',
  
  // Vitals
  HeartRate: 'HKQuantityTypeIdentifierHeartRate',
  HeartRateVariabilitySDNN: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  RestingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  WalkingHeartRateAverage: 'HKQuantityTypeIdentifierWalkingHeartRateAverage',
  BloodPressureSystolic: 'HKQuantityTypeIdentifierBloodPressureSystolic',
  BloodPressureDiastolic: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  RespiratoryRate: 'HKQuantityTypeIdentifierRespiratoryRate',
  OxygenSaturation: 'HKQuantityTypeIdentifierOxygenSaturation',
  
  // Body Measurements
  BodyMass: 'HKQuantityTypeIdentifierBodyMass',
  Height: 'HKQuantityTypeIdentifierHeight',
  BodyMassIndex: 'HKQuantityTypeIdentifierBodyMassIndex',
  BodyFatPercentage: 'HKQuantityTypeIdentifierBodyFatPercentage',
  LeanBodyMass: 'HKQuantityTypeIdentifierLeanBodyMass',
  
  // Nutrition
  DietaryFatTotal: 'HKQuantityTypeIdentifierDietaryFatTotal',
  DietaryProtein: 'HKQuantityTypeIdentifierDietaryProtein',
  DietaryCarbohydrates: 'HKQuantityTypeIdentifierDietaryCarbohydrates',
  DietaryEnergyConsumed: 'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  DietaryWater: 'HKQuantityTypeIdentifierDietaryWater',
  
  // Sleep
  SleepAnalysis: 'HKCategoryTypeIdentifierSleepAnalysis',
  
  // Other
  BodyTemperature: 'HKQuantityTypeIdentifierBodyTemperature',
  BloodGlucose: 'HKQuantityTypeIdentifierBloodGlucose'
} as const;

/**
 * Apple HealthKit category types
 */
export const AppleHealthCategoryTypes = {
  SleepAnalysis: 'HKCategoryTypeIdentifierSleepAnalysis',
  MindfulSession: 'HKCategoryTypeIdentifierMindfulSession',
  HighHeartRateEvent: 'HKCategoryTypeIdentifierHighHeartRateEvent',
  LowHeartRateEvent: 'HKCategoryTypeIdentifierLowHeartRateEvent',
  IrregularHeartRhythmEvent: 'HKCategoryTypeIdentifierIrregularHeartRhythmEvent'
} as const;

/**
 * Apple HealthKit workout types
 */
export const AppleHealthWorkoutTypes = {
  Running: 'HKWorkoutActivityTypeRunning',
  Walking: 'HKWorkoutActivityTypeWalking',
  Cycling: 'HKWorkoutActivityTypeCycling',
  Swimming: 'HKWorkoutActivityTypeSwimming',
  Yoga: 'HKWorkoutActivityTypeYoga',
  FunctionalStrengthTraining: 'HKWorkoutActivityTypeFunctionalStrengthTraining'
} as const;

/**
 * Sleep analysis values
 */
export enum SleepAnalysisValue {
  InBed = 0,
  Asleep = 1,
  Awake = 2
}

/**
 * Heart rate event types
 */
export interface HeartRateEvent {
  type: 'high' | 'low' | 'irregular';
  date: Date;
  threshold?: number;
  value?: number;
}