/**
 * FHIR Resource Validators
 * 
 * Validation functions for FHIR R4 resources
 */

import {
  Patient,
  Device,
  Observation,
  Bundle,
  Condition,
  DiagnosticReport,
  CarePlan,
  Goal
} from 'fhir/r4';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class FHIRValidator {
  /**
   * Validate a Patient resource
   */
  static validatePatient(patient: Patient): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!patient.resourceType || patient.resourceType !== 'Patient') {
      errors.push('resourceType must be "Patient"');
    }

    if (!patient.id) {
      errors.push('Patient must have an id');
    }

    // Validate identifier format
    if (patient.identifier) {
      patient.identifier.forEach((identifier, index) => {
        if (!identifier.system) {
          warnings.push(`Identifier ${index} should have a system`);
        }
        if (!identifier.value) {
          errors.push(`Identifier ${index} must have a value`);
        }
      });
    }

    // Validate name
    if (patient.name && patient.name.length > 0) {
      patient.name.forEach((name, index) => {
        if (!name.family && !name.given) {
          warnings.push(`Name ${index} should have either family or given name`);
        }
      });
    }

    // Validate gender
    if (patient.gender && !['male', 'female', 'other', 'unknown'].includes(patient.gender)) {
      errors.push('Gender must be one of: male, female, other, unknown');
    }

    // Validate birth date format
    if (patient.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(patient.birthDate)) {
      errors.push('Birth date must be in YYYY-MM-DD format');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a Device resource
   */
  static validateDevice(device: Device): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!device.resourceType || device.resourceType !== 'Device') {
      errors.push('resourceType must be "Device"');
    }

    if (!device.id) {
      errors.push('Device must have an id');
    }

    // Validate device status
    if (device.status && !['active', 'inactive', 'entered-in-error', 'unknown'].includes(device.status)) {
      errors.push('Device status must be one of: active, inactive, entered-in-error, unknown');
    }

    // Validate device type
    if (!device.type) {
      warnings.push('Device should have a type');
    }

    // Validate identifier format
    if (device.identifier) {
      device.identifier.forEach((identifier, index) => {
        if (!identifier.system) {
          warnings.push(`Device identifier ${index} should have a system`);
        }
        if (!identifier.value) {
          errors.push(`Device identifier ${index} must have a value`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate an Observation resource
   */
  static validateObservation(observation: Observation): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!observation.resourceType || observation.resourceType !== 'Observation') {
      errors.push('resourceType must be "Observation"');
    }

    if (!observation.id) {
      errors.push('Observation must have an id');
    }

    if (!observation.status) {
      errors.push('Observation must have a status');
    } else if (!['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'].includes(observation.status)) {
      errors.push('Invalid observation status');
    }

    if (!observation.code) {
      errors.push('Observation must have a code');
    }

    if (!observation.subject) {
      errors.push('Observation must have a subject');
    }

    // Validate effective date/time
    if (!observation.effectiveDateTime && !observation.effectivePeriod && !observation.effectiveInstant) {
      warnings.push('Observation should have an effective date/time');
    }

    // Validate value
    if (!observation.valueQuantity && !observation.valueCodeableConcept && !observation.valueString && 
        !observation.valueBoolean && !observation.valueInteger && !observation.valueRange && 
        !observation.valueRatio && !observation.valueSampledData && !observation.valueTime && 
        !observation.valueDateTime && !observation.valuePeriod && !observation.component) {
      warnings.push('Observation should have a value or components');
    }

    // Validate quantity units
    if (observation.valueQuantity) {
      if (!observation.valueQuantity.unit && !observation.valueQuantity.code) {
        warnings.push('Quantity should have a unit or code');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a Bundle resource
   */
  static validateBundle(bundle: Bundle): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!bundle.resourceType || bundle.resourceType !== 'Bundle') {
      errors.push('resourceType must be "Bundle"');
    }

    if (!bundle.id) {
      errors.push('Bundle must have an id');
    }

    if (!bundle.type) {
      errors.push('Bundle must have a type');
    } else if (!['document', 'message', 'transaction', 'transaction-response', 'batch', 'batch-response', 'history', 'searchset', 'collection'].includes(bundle.type)) {
      errors.push('Invalid bundle type');
    }

    // Validate entries
    if (bundle.entry) {
      bundle.entry.forEach((entry, index) => {
        if (!entry.resource) {
          warnings.push(`Bundle entry ${index} should have a resource`);
        }
      });
    }

    // Validate total count
    if (bundle.total !== undefined && bundle.entry && bundle.total !== bundle.entry.length) {
      warnings.push('Bundle total count does not match entry count');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate LOINC code format
   */
  static validateLOINCCode(code: string): boolean {
    // LOINC codes are typically 5-7 digits followed by a dash and check digit
    const loincPattern = /^\d{4,7}-\d$/;
    return loincPattern.test(code);
  }

  /**
   * Validate SNOMED CT code format
   */
  static validateSNOMEDCode(code: string): boolean {
    // SNOMED CT codes are 6-18 digit numbers
    const snomedPattern = /^\d{6,18}$/;
    return snomedPattern.test(code);
  }

  /**
   * Validate ICD-10 code format
   */
  static validateICD10Code(code: string): boolean {
    // ICD-10 codes follow specific patterns
    const icd10Pattern = /^[A-Z]\d{2}(\.[A-Z0-9]{1,4})?$/;
    return icd10Pattern.test(code);
  }

  /**
   * Validate UUID format
   */
  static validateUUID(uuid: string): boolean {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(uuid);
  }

  /**
   * Validate reference format
   */
  static validateReference(reference: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!reference) {
      errors.push('Reference cannot be empty');
      return { valid: false, errors, warnings };
    }

    // Check for resource type/id format
    const referencePattern = /^[A-Z][a-zA-Z]+\/[A-Za-z0-9\-\._]{1,64}$/;
    if (!referencePattern.test(reference)) {
      // Check if it's a UUID reference
      if (!this.validateUUID(reference)) {
        errors.push('Reference must be in format ResourceType/id or be a valid UUID');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a complete FHIR resource
   */
  static validateResource(resource: any): ValidationResult {
    if (!resource) {
      return {
        valid: false,
        errors: ['Resource cannot be null or undefined'],
        warnings: []
      };
    }

    switch (resource.resourceType) {
      case 'Patient':
        return this.validatePatient(resource as Patient);
      case 'Device':
        return this.validateDevice(resource as Device);
      case 'Observation':
        return this.validateObservation(resource as Observation);
      case 'Bundle':
        return this.validateBundle(resource as Bundle);
      default:
        return {
          valid: true,
          errors: [],
          warnings: [`Validation not implemented for resource type: ${resource.resourceType}`]
        };
    }
  }
}