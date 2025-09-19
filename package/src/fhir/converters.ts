import { 
  ObservationWithSource, 
  LOINC_CODES, 
  UCUM_UNITS,
  createLOINCCode,
  createQuantity,
  createReference,
  OBSERVATION_CATEGORIES
} from './types';
import { HealthData, HeartRateData, SpO2Data, StepsData } from '@refinio/one.btle/lib/types/health';
import { AppleHealthData } from '../apple/types';
import { GoogleFitData } from '../google/types';

/**
 * Convert BLE health data to FHIR Observation
 */
export function bleDataToFHIR(data: HealthData, patientId: string): ObservationWithSource {
  const base: ObservationWithSource = {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference('Patient', patientId),
    effectiveDateTime: data.timestamp.toISOString(),
    issued: new Date().toISOString(),
    sourceType: 'ble-device',
    sourceDeviceId: data.deviceId
  };

  switch (data.type) {
    case 'heart-rate':
      return {
        ...base,
        code: createLOINCCode(LOINC_CODES.HEART_RATE, 'Heart rate'),
        category: [OBSERVATION_CATEGORIES.VITAL_SIGNS],
        valueQuantity: createQuantity(data.value, UCUM_UNITS.BEATS_PER_MINUTE),
        ...(data.confidence && {
          interpretation: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
              code: data.confidence > 90 ? 'N' : 'L',
              display: data.confidence > 90 ? 'Normal' : 'Low confidence'
            }]
          }]
        })
      };

    case 'spo2':
      return {
        ...base,
        code: createLOINCCode(LOINC_CODES.OXYGEN_SATURATION, 'Oxygen saturation'),
        category: [OBSERVATION_CATEGORIES.VITAL_SIGNS],
        valueQuantity: createQuantity(data.value, UCUM_UNITS.PERCENT)
      };

    case 'steps':
      return {
        ...base,
        code: createLOINCCode(LOINC_CODES.STEPS_24HR, 'Steps'),
        category: [OBSERVATION_CATEGORIES.ACTIVITY],
        valueQuantity: createQuantity(data.value, UCUM_UNITS.COUNT)
      };

    case 'temperature':
      return {
        ...base,
        code: createLOINCCode(LOINC_CODES.BODY_TEMPERATURE, 'Body temperature'),
        category: [OBSERVATION_CATEGORIES.VITAL_SIGNS],
        valueQuantity: createQuantity(data.value, data.unit === 'fahrenheit' ? UCUM_UNITS.FAHRENHEIT : UCUM_UNITS.CELSIUS)
      };

    default:
      return {
        ...base,
        code: { text: data.type },
        valueQuantity: createQuantity(data.value, data.unit)
      };
  }
}

/**
 * Convert Apple HealthKit data to FHIR Observation
 */
export function appleHealthToFHIR(data: AppleHealthData, patientId: string): ObservationWithSource {
  const base: ObservationWithSource = {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference('Patient', patientId),
    effectiveDateTime: data.startDate.toISOString(),
    issued: new Date().toISOString(),
    sourceType: 'apple-health'
  };

  // Map Apple Health types to LOINC codes
  const typeMapping: Record<string, { code: string, display: string, category: any }> = {
    'HKQuantityTypeIdentifierHeartRate': {
      code: LOINC_CODES.HEART_RATE,
      display: 'Heart rate',
      category: OBSERVATION_CATEGORIES.VITAL_SIGNS
    },
    'HKQuantityTypeIdentifierStepCount': {
      code: LOINC_CODES.STEPS_24HR,
      display: 'Step count',
      category: OBSERVATION_CATEGORIES.ACTIVITY
    },
    'HKQuantityTypeIdentifierBodyMass': {
      code: LOINC_CODES.BODY_WEIGHT,
      display: 'Body weight',
      category: OBSERVATION_CATEGORIES.VITAL_SIGNS
    },
    'HKQuantityTypeIdentifierOxygenSaturation': {
      code: LOINC_CODES.OXYGEN_SATURATION,
      display: 'Oxygen saturation',
      category: OBSERVATION_CATEGORIES.VITAL_SIGNS
    }
  };

  const mapping = typeMapping[data.type];
  if (mapping) {
    return {
      ...base,
      code: createLOINCCode(mapping.code, mapping.display),
      category: [mapping.category],
      valueQuantity: createQuantity(data.value, mapAppleUnitToUCUM(data.unit)),
      device: data.sourceName ? { display: data.sourceName } : undefined
    };
  }

  // Fallback for unmapped types
  return {
    ...base,
    code: { text: data.type },
    valueQuantity: createQuantity(data.value, data.unit)
  };
}

/**
 * Convert Google Fit data to FHIR Observation
 */
export function googleFitToFHIR(data: GoogleFitData, patientId: string): ObservationWithSource {
  const base: ObservationWithSource = {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference('Patient', patientId),
    effectivePeriod: {
      start: new Date(data.startTimeMillis).toISOString(),
      end: new Date(data.endTimeMillis).toISOString()
    },
    issued: new Date().toISOString(),
    sourceType: 'google-fit'
  };

  // Map Google Fit data types to LOINC codes
  const typeMapping: Record<string, { code: string, display: string, category: any }> = {
    'com.google.heart_rate.bpm': {
      code: LOINC_CODES.HEART_RATE,
      display: 'Heart rate',
      category: OBSERVATION_CATEGORIES.VITAL_SIGNS
    },
    'com.google.step_count.delta': {
      code: LOINC_CODES.STEPS_24HR,
      display: 'Step count',
      category: OBSERVATION_CATEGORIES.ACTIVITY
    },
    'com.google.weight': {
      code: LOINC_CODES.BODY_WEIGHT,
      display: 'Body weight',
      category: OBSERVATION_CATEGORIES.VITAL_SIGNS
    },
    'com.google.oxygen_saturation': {
      code: LOINC_CODES.OXYGEN_SATURATION,
      display: 'Oxygen saturation',
      category: OBSERVATION_CATEGORIES.VITAL_SIGNS
    },
    'com.google.calories.expended': {
      code: LOINC_CODES.CALORIES_BURNED,
      display: 'Calories burned',
      category: OBSERVATION_CATEGORIES.ACTIVITY
    }
  };

  const mapping = typeMapping[data.dataTypeName];
  if (mapping && data.value.length > 0) {
    // Google Fit can have multiple values, take the first or aggregate
    const value = data.value[0].fpVal || data.value[0].intVal || 0;
    
    return {
      ...base,
      code: createLOINCCode(mapping.code, mapping.display),
      category: [mapping.category],
      valueQuantity: createQuantity(value, mapGoogleFitUnitToUCUM(data.dataTypeName)),
      device: data.dataSourceId ? { display: data.dataSourceId } : undefined
    };
  }

  // Fallback
  return {
    ...base,
    code: { text: data.dataTypeName },
    valueQuantity: data.value.length > 0 
      ? createQuantity(data.value[0].fpVal || data.value[0].intVal || 0, 'unknown')
      : undefined
  };
}

/**
 * Map Apple Health units to UCUM
 */
function mapAppleUnitToUCUM(appleUnit: string): string {
  const mapping: Record<string, string> = {
    'count/min': UCUM_UNITS.BEATS_PER_MINUTE,
    'count': UCUM_UNITS.COUNT,
    '%': UCUM_UNITS.PERCENT,
    'kg': UCUM_UNITS.KILOGRAM,
    'lb': UCUM_UNITS.POUND,
    'degC': UCUM_UNITS.CELSIUS,
    'degF': UCUM_UNITS.FAHRENHEIT,
    'kcal': UCUM_UNITS.KILOCALORIE,
    'm': UCUM_UNITS.METER,
    'km': UCUM_UNITS.KILOMETER,
    'mi': UCUM_UNITS.MILE
  };

  return mapping[appleUnit] || appleUnit;
}

/**
 * Map Google Fit data types to UCUM units
 */
function mapGoogleFitUnitToUCUM(dataType: string): string {
  const mapping: Record<string, string> = {
    'com.google.heart_rate.bpm': UCUM_UNITS.BEATS_PER_MINUTE,
    'com.google.step_count.delta': UCUM_UNITS.COUNT,
    'com.google.weight': UCUM_UNITS.KILOGRAM,
    'com.google.oxygen_saturation': UCUM_UNITS.PERCENT,
    'com.google.calories.expended': UCUM_UNITS.KILOCALORIE,
    'com.google.distance.delta': UCUM_UNITS.METER
  };

  return mapping[dataType] || 'unknown';
}

/**
 * Create a FHIR Bundle from multiple observations
 */
export function createObservationBundle(observations: ObservationWithSource[]): any {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: observations.map(obs => ({
      resource: obs,
      fullUrl: `urn:uuid:${generateUUID()}`
    }))
  };
}

/**
 * Simple UUID generator (for demo purposes)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}