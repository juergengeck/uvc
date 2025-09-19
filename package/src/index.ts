/**
 * @refinio/one.health - Health data integration for ONE platform
 * 
 * This package provides unified health data support including:
 * - Apple HealthKit integration
 * - Google Fit integration
 * - FHIR (Fast Healthcare Interoperability Resources) data models
 * - Integration with BLE health devices via one.btle
 * - Health data storage using ONE platform
 */

// Core exports
export { HealthDataService } from './services/HealthDataService';
export { HealthSyncService } from './services/HealthSyncService';
export { HealthStorageService } from './services/HealthStorageService';

// Apple Health
export { AppleHealthService } from './apple/AppleHealthService';
export * from './apple/types';

// Google Fit
export { GoogleFitService } from './google/GoogleFitService';
export * from './google/types';

// FHIR
export * from './fhir/resources';
export * from './fhir/converters';
export * from './fhir/types';
export * from './fhir/validators';
export * from './fhir/builders';

// Integrations
export { BLEHealthIntegration } from './integrations/BLEHealthIntegration';
export { ONEHealthIntegration } from './integrations/ONEHealthIntegration';

// Utils
export * from './utils/HealthUtils';
export * from './utils/DateUtils';
export * from './utils/UnitConversions';

// Types
export * from './types/health';
export * from './types/devices';
export * from './types/measurements';