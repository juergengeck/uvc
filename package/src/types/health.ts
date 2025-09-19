/**
 * Core health data types
 */

export interface HealthData {
  id: string;
  type: HealthDataType;
  value: any;
  unit?: string;
  timestamp: Date;
  source?: string;
  metadata?: Record<string, any>;
}

export enum HealthDataType {
  // Vital Signs
  HEART_RATE = 'heart_rate',
  BLOOD_PRESSURE = 'blood_pressure',
  RESPIRATORY_RATE = 'respiratory_rate',
  BODY_TEMPERATURE = 'body_temperature',
  OXYGEN_SATURATION = 'oxygen_saturation',
  
  // Body Measurements
  WEIGHT = 'weight',
  HEIGHT = 'height',
  BMI = 'bmi',
  BODY_FAT_PERCENTAGE = 'body_fat_percentage',
  WAIST_CIRCUMFERENCE = 'waist_circumference',
  
  // Activity
  STEPS = 'steps',
  DISTANCE = 'distance',
  CALORIES_BURNED = 'calories_burned',
  ACTIVE_MINUTES = 'active_minutes',
  FLOORS_CLIMBED = 'floors_climbed',
  EXERCISE_TIME = 'exercise_time',
  
  // Sleep
  SLEEP_DURATION = 'sleep_duration',
  SLEEP_QUALITY = 'sleep_quality',
  SLEEP_STAGES = 'sleep_stages',
  
  // Nutrition
  CALORIES_CONSUMED = 'calories_consumed',
  WATER_INTAKE = 'water_intake',
  PROTEIN = 'protein',
  CARBOHYDRATES = 'carbohydrates',
  FAT = 'fat',
  FIBER = 'fiber',
  SUGAR = 'sugar',
  SODIUM = 'sodium',
  
  // Blood Metrics
  BLOOD_GLUCOSE = 'blood_glucose',
  CHOLESTEROL = 'cholesterol',
  HEMOGLOBIN = 'hemoglobin',
  
  // Other
  STRESS_LEVEL = 'stress_level',
  MOOD = 'mood',
  MEDITATION_TIME = 'meditation_time',
}

export interface VitalSigns {
  heartRate?: number;
  bloodPressure?: BloodPressure;
  respiratoryRate?: number;
  bodyTemperature?: number;
  oxygenSaturation?: number;
}

export interface BloodPressure {
  systolic: number;
  diastolic: number;
  pulse?: number;
}

export interface BodyMeasurements {
  weight?: number;
  height?: number;
  bmi?: number;
  bodyFatPercentage?: number;
  waistCircumference?: number;
  hipCircumference?: number;
  muscleMass?: number;
  boneMass?: number;
}

export interface ActivityData {
  steps?: number;
  distance?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  floorsClimbed?: number;
  exerciseTime?: number;
  activityType?: string;
}

export interface SleepData {
  duration: number; // in minutes
  quality?: number; // 0-100
  stages?: SleepStages;
  startTime: Date;
  endTime: Date;
}

export interface SleepStages {
  awake?: number;
  light?: number;
  deep?: number;
  rem?: number;
}

export interface NutritionData {
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  water?: number;
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
}

export interface HealthGoal {
  id: string;
  type: HealthDataType;
  target: number;
  unit?: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
}

export interface HealthSummary {
  date: Date;
  vitalSigns?: VitalSigns;
  activity?: ActivityData;
  sleep?: SleepData;
  nutrition?: NutritionData;
  bodyMeasurements?: BodyMeasurements;
}

export interface HealthTrend {
  type: HealthDataType;
  period: 'day' | 'week' | 'month' | 'year';
  data: Array<{
    date: Date;
    value: number;
  }>;
  average?: number;
  min?: number;
  max?: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
}

export interface HealthAlert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  dataType: HealthDataType;
  message: string;
  timestamp: Date;
  value?: number;
  threshold?: number;
  action?: string;
}

export interface HealthProfile {
  userId: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  height?: number;
  weight?: number;
  bloodType?: string;
  allergies?: string[];
  medications?: string[];
  conditions?: string[];
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
}