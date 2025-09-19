/**
 * FHIR Resource Builders
 * 
 * Fluent builder pattern for creating FHIR resources
 */

import {
  Patient,
  Device,
  Observation,
  Bundle,
  Identifier,
  CodeableConcept,
  Quantity,
  Reference,
  HumanName,
  ContactPoint,
  Address
} from 'fhir/r4';

export class PatientBuilder {
  private patient: Patient;

  constructor(id: string) {
    this.patient = {
      resourceType: 'Patient',
      id
    };
  }

  addIdentifier(system: string, value: string): this {
    if (!this.patient.identifier) {
      this.patient.identifier = [];
    }
    this.patient.identifier.push({ system, value });
    return this;
  }

  setName(given: string[], family: string): this {
    if (!this.patient.name) {
      this.patient.name = [];
    }
    this.patient.name.push({ given, family });
    return this;
  }

  setGender(gender: 'male' | 'female' | 'other' | 'unknown'): this {
    this.patient.gender = gender;
    return this;
  }

  setBirthDate(birthDate: string): this {
    this.patient.birthDate = birthDate;
    return this;
  }

  addTelecom(system: 'phone' | 'email' | 'fax' | 'pager' | 'url' | 'sms' | 'other', value: string): this {
    if (!this.patient.telecom) {
      this.patient.telecom = [];
    }
    this.patient.telecom.push({ system, value });
    return this;
  }

  addAddress(address: {
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }): this {
    if (!this.patient.address) {
      this.patient.address = [];
    }
    this.patient.address.push(address);
    return this;
  }

  build(): Patient {
    return { ...this.patient };
  }
}

export class DeviceBuilder {
  private device: Device;

  constructor(id: string) {
    this.device = {
      resourceType: 'Device',
      id
    };
  }

  addIdentifier(system: string, value: string): this {
    if (!this.device.identifier) {
      this.device.identifier = [];
    }
    this.device.identifier.push({ system, value });
    return this;
  }

  setDisplayName(displayName: string): this {
    this.device.displayName = displayName;
    return this;
  }

  setType(system: string, code: string, display: string): this {
    this.device.type = {
      coding: [{ system, code, display }]
    };
    return this;
  }

  setManufacturer(manufacturer: string): this {
    this.device.manufacturer = manufacturer;
    return this;
  }

  setModel(model: string): this {
    this.device.modelNumber = model;
    return this;
  }

  setVersion(version: string): this {
    this.device.version = [{ value: version }];
    return this;
  }

  setStatus(status: 'active' | 'inactive' | 'entered-in-error' | 'unknown'): this {
    this.device.status = status;
    return this;
  }

  setPatient(patientReference: string): this {
    this.device.patient = { reference: patientReference };
    return this;
  }

  build(): Device {
    return { ...this.device };
  }
}

export class ObservationBuilder {
  private observation: Observation;

  constructor(id: string) {
    this.observation = {
      resourceType: 'Observation',
      id,
      status: 'final'
    };
  }

  setStatus(status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown'): this {
    this.observation.status = status;
    return this;
  }

  addCategory(system: string, code: string, display: string): this {
    if (!this.observation.category) {
      this.observation.category = [];
    }
    this.observation.category.push({
      coding: [{ system, code, display }]
    });
    return this;
  }

  setCode(system: string, code: string, display: string): this {
    this.observation.code = {
      coding: [{ system, code, display }]
    };
    return this;
  }

  setSubject(subjectReference: string): this {
    this.observation.subject = { reference: subjectReference };
    return this;
  }

  setEffectiveDateTime(dateTime: string): this {
    this.observation.effectiveDateTime = dateTime;
    return this;
  }

  setEffectivePeriod(start: string, end: string): this {
    this.observation.effectivePeriod = { start, end };
    return this;
  }

  setValueQuantity(value: number, unit: string, system?: string, code?: string): this {
    this.observation.valueQuantity = {
      value,
      unit,
      system: system || 'http://unitsofmeasure.org',
      code: code || unit
    };
    return this;
  }

  setValueString(value: string): this {
    this.observation.valueString = value;
    return this;
  }

  setValueBoolean(value: boolean): this {
    this.observation.valueBoolean = value;
    return this;
  }

  setValueCodeableConcept(system: string, code: string, display: string): this {
    this.observation.valueCodeableConcept = {
      coding: [{ system, code, display }]
    };
    return this;
  }

  setDevice(deviceReference: string): this {
    this.observation.device = { reference: deviceReference };
    return this;
  }

  addComponent(code: { system: string; code: string; display: string }, valueQuantity?: Quantity, valueString?: string): this {
    if (!this.observation.component) {
      this.observation.component = [];
    }

    const component: any = {
      code: {
        coding: [code]
      }
    };

    if (valueQuantity) {
      component.valueQuantity = valueQuantity;
    }
    if (valueString) {
      component.valueString = valueString;
    }

    this.observation.component.push(component);
    return this;
  }

  addNote(text: string): this {
    if (!this.observation.note) {
      this.observation.note = [];
    }
    this.observation.note.push({ text });
    return this;
  }

  build(): Observation {
    return { ...this.observation };
  }
}

export class BundleBuilder {
  private bundle: Bundle;

  constructor(id: string, type: Bundle['type']) {
    this.bundle = {
      resourceType: 'Bundle',
      id,
      type,
      timestamp: new Date().toISOString(),
      entry: []
    };
  }

  addResource(resource: any): this {
    if (!this.bundle.entry) {
      this.bundle.entry = [];
    }
    this.bundle.entry.push({ resource });
    return this;
  }

  addEntry(entry: Bundle['entry'][0]): this {
    if (!this.bundle.entry) {
      this.bundle.entry = [];
    }
    this.bundle.entry.push(entry);
    return this;
  }

  setTotal(total: number): this {
    this.bundle.total = total;
    return this;
  }

  build(): Bundle {
    if (this.bundle.entry) {
      this.bundle.total = this.bundle.entry.length;
    }
    return { ...this.bundle };
  }
}

/**
 * Convenience builders for common health observations
 */
export class HealthObservationBuilders {
  /**
   * Create a heart rate observation
   */
  static heartRate(
    id: string,
    patientReference: string,
    value: number,
    timestamp: Date,
    deviceReference?: string
  ): Observation {
    const builder = new ObservationBuilder(id)
      .addCategory('http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs', 'Vital Signs')
      .setCode('http://loinc.org', '8867-4', 'Heart rate')
      .setSubject(patientReference)
      .setEffectiveDateTime(timestamp.toISOString())
      .setValueQuantity(value, 'beats/min', 'http://unitsofmeasure.org', '/min');

    if (deviceReference) {
      builder.setDevice(deviceReference);
    }

    return builder.build();
  }

  /**
   * Create a SpO2 observation
   */
  static spO2(
    id: string,
    patientReference: string,
    value: number,
    timestamp: Date,
    deviceReference?: string
  ): Observation {
    const builder = new ObservationBuilder(id)
      .addCategory('http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs', 'Vital Signs')
      .setCode('http://loinc.org', '59408-5', 'Oxygen saturation in Arterial blood by Pulse oximetry')
      .setSubject(patientReference)
      .setEffectiveDateTime(timestamp.toISOString())
      .setValueQuantity(value, '%', 'http://unitsofmeasure.org', '%');

    if (deviceReference) {
      builder.setDevice(deviceReference);
    }

    return builder.build();
  }

  /**
   * Create a step count observation
   */
  static stepCount(
    id: string,
    patientReference: string,
    value: number,
    timestamp: Date,
    deviceReference?: string,
    period?: { start: Date; end: Date }
  ): Observation {
    const builder = new ObservationBuilder(id)
      .addCategory('http://terminology.hl7.org/CodeSystem/observation-category', 'activity', 'Activity')
      .setCode('http://loinc.org', '55423-8', 'Number of steps')
      .setSubject(patientReference)
      .setValueQuantity(value, 'steps', 'http://unitsofmeasure.org', '{steps}');

    if (period) {
      builder.setEffectivePeriod(period.start.toISOString(), period.end.toISOString());
    } else {
      builder.setEffectiveDateTime(timestamp.toISOString());
    }

    if (deviceReference) {
      builder.setDevice(deviceReference);
    }

    return builder.build();
  }

  /**
   * Create a body temperature observation
   */
  static bodyTemperature(
    id: string,
    patientReference: string,
    value: number,
    timestamp: Date,
    unit: 'Cel' | 'degF' = 'Cel',
    deviceReference?: string
  ): Observation {
    const builder = new ObservationBuilder(id)
      .addCategory('http://terminology.hl7.org/CodeSystem/observation-category', 'vital-signs', 'Vital Signs')
      .setCode('http://loinc.org', '8310-5', 'Body temperature')
      .setSubject(patientReference)
      .setEffectiveDateTime(timestamp.toISOString())
      .setValueQuantity(value, unit === 'Cel' ? 'Cel' : 'degF', 'http://unitsofmeasure.org', unit);

    if (deviceReference) {
      builder.setDevice(deviceReference);
    }

    return builder.build();
  }
}