import { 
  Observation as FHIRObservation,
  Patient as FHIRPatient,
  Practitioner as FHIRPractitioner,
  Device as FHIRDevice,
  Bundle as FHIRBundle,
  CodeableConcept,
  Quantity,
  Reference
} from 'fhir/r4';

/**
 * Extended FHIR types for ONE platform integration
 */

export interface ObservationWithSource extends FHIRObservation {
  sourceType?: 'apple-health' | 'google-fit' | 'ble-device' | 'manual';
  sourceDeviceId?: string;
  syncedAt?: string;
}

export interface HealthKitObservation extends ObservationWithSource {
  sourceType: 'apple-health';
  healthKitIdentifier?: string;
  healthKitSourceBundleId?: string;
}

export interface BLEDeviceObservation extends ObservationWithSource {
  sourceType: 'ble-device';
  deviceModel?: string;
  deviceFirmwareVersion?: string;
  signalStrength?: number;
}

/**
 * LOINC codes for common health measurements
 * Reference: https://loinc.org/
 */
export const LOINC_CODES = {
  // Vital Signs
  HEART_RATE: '8867-4',
  BLOOD_PRESSURE_SYSTOLIC: '8480-6',
  BLOOD_PRESSURE_DIASTOLIC: '8462-4',
  BODY_TEMPERATURE: '8310-5',
  RESPIRATORY_RATE: '9279-1',
  OXYGEN_SATURATION: '59408-5',
  
  // Body Measurements
  BODY_WEIGHT: '29463-7',
  BODY_HEIGHT: '8302-2',
  BMI: '39156-5',
  BODY_FAT_PERCENTAGE: '41982-0',
  
  // Activity
  STEPS_24HR: '55423-8',
  CALORIES_BURNED: '41981-2',
  DISTANCE_WALKED: '55430-3',
  ACTIVE_MINUTES: '77592-5',
  
  // Sleep
  SLEEP_DURATION: '93832-4',
  SLEEP_QUALITY: '93831-6',
  
  // Blood Glucose
  BLOOD_GLUCOSE: '15074-8',
  HBA1C: '4548-4'
} as const;

/**
 * UCUM units for measurements
 * Reference: https://unitsofmeasure.org/ucum.html
 */
export const UCUM_UNITS = {
  // Basic units
  COUNT: '{count}',
  PERCENT: '%',
  
  // Time
  SECOND: 's',
  MINUTE: 'min',
  HOUR: 'h',
  
  // Mass
  KILOGRAM: 'kg',
  GRAM: 'g',
  POUND: '[lb_av]',
  
  // Length
  METER: 'm',
  CENTIMETER: 'cm',
  KILOMETER: 'km',
  MILE: '[mi_i]',
  
  // Temperature
  CELSIUS: 'Cel',
  FAHRENHEIT: '[degF]',
  
  // Frequency
  BEATS_PER_MINUTE: '/min',
  BREATHS_PER_MINUTE: '/min',
  
  // Pressure
  MM_HG: 'mm[Hg]',
  
  // Energy
  KILOCALORIE: 'kcal',
  KILOJOULE: 'kJ',
  
  // Concentration
  MMOL_L: 'mmol/L',
  MG_DL: 'mg/dL'
} as const;

/**
 * Helper function to create LOINC CodeableConcept
 */
export function createLOINCCode(code: string, display: string): CodeableConcept {
  return {
    coding: [{
      system: 'http://loinc.org',
      code,
      display
    }],
    text: display
  };
}

/**
 * Helper function to create Quantity with UCUM unit
 */
export function createQuantity(value: number, unit: string, system = 'http://unitsofmeasure.org'): Quantity {
  return {
    value,
    unit,
    system,
    code: unit
  };
}

/**
 * Helper function to create Reference
 */
export function createReference(resourceType: string, id: string, display?: string): Reference {
  return {
    reference: `${resourceType}/${id}`,
    display
  };
}

/**
 * Observation categories
 */
export const OBSERVATION_CATEGORIES = {
  VITAL_SIGNS: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs',
      display: 'Vital Signs'
    }]
  },
  ACTIVITY: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'activity',
      display: 'Activity'
    }]
  },
  LABORATORY: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'laboratory',
      display: 'Laboratory'
    }]
  }
} as const;