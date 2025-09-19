/**
 * Health measurement type definitions
 */

export interface Measurement {
  id: string;
  type: MeasurementType;
  value: number | MeasurementValue;
  unit: string;
  timestamp: Date;
  deviceId?: string;
  source?: string;
  confidence?: number; // 0-1 confidence score
  metadata?: MeasurementMetadata;
}

export enum MeasurementType {
  // Cardiovascular
  HEART_RATE = 'heart_rate',
  HEART_RATE_VARIABILITY = 'heart_rate_variability',
  BLOOD_PRESSURE = 'blood_pressure',
  RESTING_HEART_RATE = 'resting_heart_rate',
  WALKING_HEART_RATE = 'walking_heart_rate',
  ECG = 'ecg',
  
  // Respiratory
  RESPIRATORY_RATE = 'respiratory_rate',
  OXYGEN_SATURATION = 'oxygen_saturation',
  VO2_MAX = 'vo2_max',
  LUNG_CAPACITY = 'lung_capacity',
  
  // Body Composition
  WEIGHT = 'weight',
  HEIGHT = 'height',
  BMI = 'bmi',
  BODY_FAT = 'body_fat',
  MUSCLE_MASS = 'muscle_mass',
  BONE_MASS = 'bone_mass',
  WATER_PERCENTAGE = 'water_percentage',
  VISCERAL_FAT = 'visceral_fat',
  METABOLIC_AGE = 'metabolic_age',
  BASAL_METABOLIC_RATE = 'basal_metabolic_rate',
  
  // Activity
  STEPS = 'steps',
  DISTANCE = 'distance',
  FLOORS_CLIMBED = 'floors_climbed',
  CALORIES_BURNED = 'calories_burned',
  ACTIVE_CALORIES = 'active_calories',
  ACTIVITY_MINUTES = 'activity_minutes',
  STANDING_TIME = 'standing_time',
  MOVE_MINUTES = 'move_minutes',
  EXERCISE_TIME = 'exercise_time',
  
  // Sleep
  SLEEP_DURATION = 'sleep_duration',
  SLEEP_EFFICIENCY = 'sleep_efficiency',
  SLEEP_LATENCY = 'sleep_latency',
  WAKE_EPISODES = 'wake_episodes',
  REM_SLEEP = 'rem_sleep',
  DEEP_SLEEP = 'deep_sleep',
  LIGHT_SLEEP = 'light_sleep',
  
  // Blood
  BLOOD_GLUCOSE = 'blood_glucose',
  BLOOD_KETONES = 'blood_ketones',
  HEMOGLOBIN = 'hemoglobin',
  HEMATOCRIT = 'hematocrit',
  CHOLESTEROL_TOTAL = 'cholesterol_total',
  CHOLESTEROL_LDL = 'cholesterol_ldl',
  CHOLESTEROL_HDL = 'cholesterol_hdl',
  TRIGLYCERIDES = 'triglycerides',
  
  // Temperature
  BODY_TEMPERATURE = 'body_temperature',
  SKIN_TEMPERATURE = 'skin_temperature',
  
  // Other
  STRESS_LEVEL = 'stress_level',
  HYDRATION = 'hydration',
  UV_EXPOSURE = 'uv_exposure',
  NOISE_EXPOSURE = 'noise_exposure',
  MEDITATION_MINUTES = 'meditation_minutes',
  MINDFULNESS_MINUTES = 'mindfulness_minutes'
}

export interface MeasurementValue {
  primary: number;
  secondary?: number;
  additional?: Record<string, number>;
}

export interface MeasurementMetadata {
  method?: MeasurementMethod;
  position?: MeasurementPosition;
  conditions?: MeasurementConditions;
  quality?: MeasurementQuality;
  notes?: string;
  tags?: string[];
}

export enum MeasurementMethod {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
  ESTIMATED = 'estimated',
  CALCULATED = 'calculated',
  SENSOR = 'sensor',
  WEARABLE = 'wearable',
  CLINICAL = 'clinical',
  SELF_REPORTED = 'self_reported'
}

export enum MeasurementPosition {
  SITTING = 'sitting',
  STANDING = 'standing',
  LYING = 'lying',
  WALKING = 'walking',
  RUNNING = 'running',
  EXERCISING = 'exercising',
  RESTING = 'resting',
  SLEEPING = 'sleeping'
}

export interface MeasurementConditions {
  fasting?: boolean;
  postMeal?: boolean;
  preExercise?: boolean;
  postExercise?: boolean;
  morning?: boolean;
  evening?: boolean;
  stressed?: boolean;
  relaxed?: boolean;
  medication?: string[];
  weather?: {
    temperature?: number;
    humidity?: number;
    pressure?: number;
  };
}

export interface MeasurementQuality {
  accuracy?: 'high' | 'medium' | 'low';
  completeness?: number; // 0-1
  reliability?: number; // 0-1
  signalQuality?: number; // 0-100
  artifacts?: boolean;
  outlier?: boolean;
}

export interface MeasurementRange {
  min: number;
  max: number;
  optimal?: {
    min: number;
    max: number;
  };
  unit: string;
}

export interface MeasurementGoal {
  type: MeasurementType;
  target: number | MeasurementRange;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  progress?: number; // 0-100
}

export interface MeasurementStatistics {
  type: MeasurementType;
  period: {
    start: Date;
    end: Date;
  };
  count: number;
  mean?: number;
  median?: number;
  mode?: number;
  standardDeviation?: number;
  min?: number;
  max?: number;
  sum?: number;
  percentiles?: {
    p25?: number;
    p50?: number;
    p75?: number;
    p90?: number;
    p95?: number;
    p99?: number;
  };
}

export interface MeasurementComparison {
  current: Measurement;
  previous?: Measurement;
  average?: number;
  change?: {
    absolute: number;
    percentage: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  benchmark?: {
    population: number;
    percentile: number;
    category: string;
  };
}

export interface MeasurementValidation {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}

export interface MeasurementUnit {
  name: string;
  symbol: string;
  type: 'metric' | 'imperial';
  conversionFactor?: number; // to base unit
  baseUnit?: string;
}

export const MEASUREMENT_UNITS: Record<string, MeasurementUnit> = {
  // Weight
  kg: { name: 'kilogram', symbol: 'kg', type: 'metric' },
  lbs: { name: 'pounds', symbol: 'lbs', type: 'imperial', conversionFactor: 0.453592, baseUnit: 'kg' },
  
  // Distance
  m: { name: 'meter', symbol: 'm', type: 'metric' },
  km: { name: 'kilometer', symbol: 'km', type: 'metric', conversionFactor: 1000, baseUnit: 'm' },
  miles: { name: 'miles', symbol: 'mi', type: 'imperial', conversionFactor: 1609.34, baseUnit: 'm' },
  
  // Heart Rate
  bpm: { name: 'beats per minute', symbol: 'bpm', type: 'metric' },
  
  // Blood Pressure
  mmHg: { name: 'millimeters of mercury', symbol: 'mmHg', type: 'metric' },
  
  // Temperature
  celsius: { name: 'celsius', symbol: '°C', type: 'metric' },
  fahrenheit: { name: 'fahrenheit', symbol: '°F', type: 'imperial' },
  
  // Blood Glucose
  mgdl: { name: 'milligrams per deciliter', symbol: 'mg/dL', type: 'imperial' },
  mmoll: { name: 'millimoles per liter', symbol: 'mmol/L', type: 'metric' },
  
  // Time
  min: { name: 'minutes', symbol: 'min', type: 'metric' },
  hours: { name: 'hours', symbol: 'h', type: 'metric', conversionFactor: 60, baseUnit: 'min' },
  
  // Energy
  kcal: { name: 'kilocalories', symbol: 'kcal', type: 'metric' },
  cal: { name: 'calories', symbol: 'cal', type: 'metric', conversionFactor: 0.001, baseUnit: 'kcal' },
  kj: { name: 'kilojoules', symbol: 'kJ', type: 'metric', conversionFactor: 0.239006, baseUnit: 'kcal' },
  
  // Percentage
  percent: { name: 'percent', symbol: '%', type: 'metric' },
  
  // Count
  count: { name: 'count', symbol: '', type: 'metric' },
  steps: { name: 'steps', symbol: 'steps', type: 'metric' },
  floors: { name: 'floors', symbol: 'floors', type: 'metric' },
};