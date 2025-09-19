/**
 * FHIR Resource builders and templates
 * Based on FHIR R4 specification
 */

import {
  Patient,
  Practitioner,
  Organization,
  Device,
  Observation,
  Bundle,
  Encounter,
  Condition,
  MedicationStatement,
  AllergyIntolerance,
  Immunization,
  Procedure,
  DiagnosticReport,
  CarePlan,
  Goal,
  CareTeam
} from 'fhir/r4';

/**
 * Create a Patient resource
 */
export function createPatient(params: {
  id: string;
  identifier?: Array<{ system: string; value: string }>;
  name: {
    given: string[];
    family: string;
  };
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string;
  telecom?: Array<{ system: 'phone' | 'email'; value: string }>;
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}): Patient {
  return {
    resourceType: 'Patient',
    id: params.id,
    identifier: params.identifier,
    name: [{
      given: params.name.given,
      family: params.name.family
    }],
    gender: params.gender,
    birthDate: params.birthDate,
    telecom: params.telecom,
    address: params.address
  };
}

/**
 * Create a Device resource for BLE devices
 */
export function createDevice(params: {
  id: string;
  identifier?: Array<{ system: string; value: string }>;
  displayName: string;
  type: {
    coding: Array<{ system: string; code: string; display: string }>;
    text?: string;
  };
  manufacturer?: string;
  model?: string;
  version?: string;
  status?: 'active' | 'inactive' | 'entered-in-error' | 'unknown';
  patient?: { reference: string };
}): Device {
  return {
    resourceType: 'Device',
    id: params.id,
    identifier: params.identifier,
    displayName: params.displayName,
    type: params.type,
    manufacturer: params.manufacturer,
    modelNumber: params.model,
    version: params.version ? [{ value: params.version }] : undefined,
    status: params.status || 'active',
    patient: params.patient
  };
}

/**
 * Create an Organization resource
 */
export function createOrganization(params: {
  id: string;
  name: string;
  type?: Array<{
    coding: Array<{ system: string; code: string; display: string }>;
  }>;
  telecom?: Array<{ system: 'phone' | 'email' | 'url'; value: string }>;
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }>;
}): Organization {
  return {
    resourceType: 'Organization',
    id: params.id,
    name: params.name,
    type: params.type,
    telecom: params.telecom,
    address: params.address
  };
}

/**
 * Create device types for common BLE health devices
 */
export const DeviceTypes = {
  SMART_RING: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '469801000124102',
      display: 'Smart ring'
    }],
    text: 'Smart ring health monitor'
  },
  FITNESS_TRACKER: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '469831000124108',
      display: 'Fitness tracker'
    }],
    text: 'Fitness tracking device'
  },
  SMART_WATCH: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '469821000124107',
      display: 'Smart watch'
    }],
    text: 'Smart watch with health monitoring'
  },
  PULSE_OXIMETER: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '706767009',
      display: 'Pulse oximeter'
    }],
    text: 'Pulse oximeter device'
  },
  BLOOD_PRESSURE_MONITOR: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '43770009',
      display: 'Sphygmomanometer'
    }],
    text: 'Blood pressure monitoring device'
  }
};

/**
 * Create a Condition resource
 */
export function createCondition(params: {
  id: string;
  clinicalStatus: {
    coding: Array<{ system: string; code: string }>;
  };
  verificationStatus?: {
    coding: Array<{ system: string; code: string }>;
  };
  category?: Array<{
    coding: Array<{ system: string; code: string; display: string }>;
  }>;
  severity?: {
    coding: Array<{ system: string; code: string; display: string }>;
  };
  code: {
    coding: Array<{ system: string; code: string; display: string }>;
    text?: string;
  };
  subject: { reference: string };
  onsetDateTime?: string;
  recordedDate?: string;
}): Condition {
  return {
    resourceType: 'Condition',
    id: params.id,
    clinicalStatus: params.clinicalStatus,
    verificationStatus: params.verificationStatus,
    category: params.category,
    severity: params.severity,
    code: params.code,
    subject: params.subject,
    onsetDateTime: params.onsetDateTime,
    recordedDate: params.recordedDate
  };
}

/**
 * Create a DiagnosticReport resource
 */
export function createDiagnosticReport(params: {
  id: string;
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'appended' | 'cancelled' | 'entered-in-error' | 'unknown';
  code: {
    coding: Array<{ system: string; code: string; display: string }>;
    text?: string;
  };
  subject: { reference: string };
  effectiveDateTime?: string;
  issued?: string;
  performer?: Array<{ reference: string }>;
  result?: Array<{ reference: string }>;
  conclusion?: string;
}): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id: params.id,
    status: params.status,
    code: params.code,
    subject: params.subject,
    effectiveDateTime: params.effectiveDateTime,
    issued: params.issued,
    performer: params.performer,
    result: params.result,
    conclusion: params.conclusion
  };
}

/**
 * Create a CarePlan resource
 */
export function createCarePlan(params: {
  id: string;
  status: 'draft' | 'active' | 'suspended' | 'completed' | 'entered-in-error' | 'cancelled' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'option';
  title?: string;
  description?: string;
  subject: { reference: string };
  period?: {
    start?: string;
    end?: string;
  };
  author?: { reference: string };
  careTeam?: Array<{ reference: string }>;
  category?: Array<{
    coding: Array<{ system: string; code: string; display: string }>;
  }>;
  activity?: Array<{
    detail?: {
      kind?: 'Appointment' | 'CommunicationRequest' | 'DeviceRequest' | 'MedicationRequest' | 'NutritionOrder' | 'Task' | 'ServiceRequest' | 'VisionPrescription';
      status: 'not-started' | 'scheduled' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled' | 'stopped' | 'unknown' | 'entered-in-error';
      description?: string;
      code?: {
        coding: Array<{ system: string; code: string; display: string }>;
      };
    };
  }>;
}): CarePlan {
  return {
    resourceType: 'CarePlan',
    id: params.id,
    status: params.status,
    intent: params.intent,
    title: params.title,
    description: params.description,
    subject: params.subject,
    period: params.period,
    author: params.author,
    careTeam: params.careTeam,
    category: params.category,
    activity: params.activity
  };
}

/**
 * Create a Goal resource for health goals
 */
export function createGoal(params: {
  id: string;
  lifecycleStatus: 'proposed' | 'planned' | 'accepted' | 'active' | 'on-hold' | 'completed' | 'cancelled' | 'entered-in-error' | 'rejected';
  achievementStatus?: {
    coding: Array<{ system: string; code: string; display: string }>;
  };
  category?: Array<{
    coding: Array<{ system: string; code: string; display: string }>;
  }>;
  priority?: {
    coding: Array<{ system: string; code: string; display: string }>;
  };
  description: {
    text: string;
  };
  subject: { reference: string };
  startDate?: string;
  target?: Array<{
    measure?: {
      coding: Array<{ system: string; code: string; display: string }>;
    };
    detailQuantity?: {
      value: number;
      unit: string;
      system?: string;
      code?: string;
    };
    dueDate?: string;
  }>;
}): Goal {
  return {
    resourceType: 'Goal',
    id: params.id,
    lifecycleStatus: params.lifecycleStatus,
    achievementStatus: params.achievementStatus,
    category: params.category,
    priority: params.priority,
    description: params.description,
    subject: params.subject,
    startDate: params.startDate,
    target: params.target
  };
}

/**
 * Common condition codes
 */
export const ConditionCodes = {
  HYPERTENSION: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '38341003',
      display: 'Hypertension'
    }]
  },
  DIABETES_TYPE2: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '44054006',
      display: 'Type 2 diabetes mellitus'
    }]
  },
  OBESITY: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '414916001',
      display: 'Obesity'
    }]
  },
  SLEEP_APNEA: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '73430006',
      display: 'Sleep apnea'
    }]
  }
};

/**
 * Common goal categories
 */
export const GoalCategories = {
  PHYSICAL_ACTIVITY: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/goal-category',
      code: 'physical-activity',
      display: 'Physical Activity'
    }]
  },
  DIETARY: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/goal-category',
      code: 'dietary',
      display: 'Dietary'
    }]
  },
  BEHAVIORAL: {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/goal-category',
      code: 'behavioral',
      display: 'Behavioral'
    }]
  }
};