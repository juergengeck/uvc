import AppleHealthKit, { 
  HealthValue, 
  HealthKitPermissions,
  HealthInputOptions,
  HealthUnit
} from 'react-native-health';
import { 
  AppleHealthData, 
  AppleHealthOptions, 
  AppleHealthQuantityTypes,
  AppleHealthCategoryTypes,
  SleepAnalysisValue
} from './types';
import { EventEmitter } from 'events';

export class AppleHealthService extends EventEmitter {
  private isAvailable: boolean = false;
  private isAuthorized: boolean = false;
  private permissions: HealthKitPermissions = { permissions: { read: [], write: [] } };

  constructor() {
    super();
    this.checkAvailability();
  }

  private checkAvailability() {
    AppleHealthKit.isAvailable((error: Error | null, available: boolean) => {
      if (error) {
        this.emit('error', error);
        return;
      }
      this.isAvailable = available;
      this.emit('availabilityChanged', available);
    });
  }

  async requestPermissions(permissions: string[]): Promise<boolean> {
    if (!this.isAvailable) {
      throw new Error('Apple Health is not available on this device');
    }

    return new Promise((resolve, reject) => {
      this.permissions = {
        permissions: {
          read: permissions,
          write: [] // Only read permissions for now
        }
      };

      AppleHealthKit.initHealthKit(this.permissions, (error: string) => {
        if (error) {
          this.isAuthorized = false;
          reject(new Error(error));
          return;
        }
        
        this.isAuthorized = true;
        this.emit('authorized');
        resolve(true);
      });
    });
  }

  async getHeartRateSamples(startDate: Date, endDate: Date): Promise<AppleHealthData[]> {
    if (!this.isAuthorized) {
      throw new Error('Not authorized to access Apple Health');
    }

    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: false,
      limit: 100
    };

    return new Promise((resolve, reject) => {
      AppleHealthKit.getHeartRateSamples(options, (error: string, results: HealthValue[]) => {
        if (error) {
          reject(new Error(error));
          return;
        }

        const data = results.map(this.mapHealthValue);
        resolve(data);
      });
    });
  }

  async getStepCount(date: Date = new Date()): Promise<number> {
    if (!this.isAuthorized) {
      throw new Error('Not authorized to access Apple Health');
    }

    const options: HealthInputOptions = {
      date: date.toISOString()
    };

    return new Promise((resolve, reject) => {
      AppleHealthKit.getStepCount(options, (error: string, result: { value: number }) => {
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve(result.value);
      });
    });
  }

  async getOxygenSaturationSamples(startDate: Date, endDate: Date): Promise<AppleHealthData[]> {
    if (!this.isAuthorized) {
      throw new Error('Not authorized to access Apple Health');
    }

    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: false
    };

    return new Promise((resolve, reject) => {
      AppleHealthKit.getOxygenSaturationSamples(options, (error: string, results: HealthValue[]) => {
        if (error) {
          reject(new Error(error));
          return;
        }

        const data = results.map(this.mapHealthValue);
        resolve(data);
      });
    });
  }

  async getSleepSamples(startDate: Date, endDate: Date): Promise<AppleHealthData[]> {
    if (!this.isAuthorized) {
      throw new Error('Not authorized to access Apple Health');
    }

    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: 100
    };

    return new Promise((resolve, reject) => {
      AppleHealthKit.getSleepSamples(options, (error: string, results: HealthValue[]) => {
        if (error) {
          reject(new Error(error));
          return;
        }

        const data = results.map(sample => ({
          ...this.mapHealthValue(sample),
          type: AppleHealthCategoryTypes.SleepAnalysis,
          value: sample.value as SleepAnalysisValue
        }));
        
        resolve(data);
      });
    });
  }

  async getLatestWeight(): Promise<AppleHealthData | null> {
    if (!this.isAuthorized) {
      throw new Error('Not authorized to access Apple Health');
    }

    const options: HealthInputOptions = {
      unit: HealthUnit.pound
    };

    return new Promise((resolve, reject) => {
      AppleHealthKit.getLatestWeight(options, (error: string, result: HealthValue) => {
        if (error) {
          reject(new Error(error));
          return;
        }
        
        if (!result) {
          resolve(null);
          return;
        }

        resolve(this.mapHealthValue(result));
      });
    });
  }

  async getWorkoutSamples(startDate: Date, endDate: Date): Promise<any[]> {
    if (!this.isAuthorized) {
      throw new Error('Not authorized to access Apple Health');
    }

    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: false
    };

    return new Promise((resolve, reject) => {
      AppleHealthKit.getSamples(options, (error: string, results: any[]) => {
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve(results);
      });
    });
  }

  /**
   * Start observing real-time updates for a specific data type
   */
  startObserving(dataType: string, callback: (data: AppleHealthData) => void): () => void {
    if (!this.isAuthorized) {
      throw new Error('Not authorized to access Apple Health');
    }

    // Note: Real-time observation requires native module extension
    // This is a placeholder for the pattern
    const interval = setInterval(async () => {
      try {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 60000); // Last minute
        
        if (dataType === AppleHealthQuantityTypes.HeartRate) {
          const samples = await this.getHeartRateSamples(startDate, endDate);
          if (samples.length > 0) {
            callback(samples[samples.length - 1]);
          }
        }
        // Add other data types as needed
      } catch (error) {
        this.emit('error', error);
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }

  private mapHealthValue(value: HealthValue): AppleHealthData {
    return {
      id: value.id || `${value.startDate}-${value.value}`,
      type: value.type || 'unknown',
      value: value.value,
      unit: value.unit || 'unknown',
      startDate: new Date(value.startDate),
      endDate: new Date(value.endDate),
      sourceName: value.sourceName,
      sourceId: value.sourceId,
      metadata: value.metadata
    };
  }

  async disconnect() {
    this.isAuthorized = false;
    this.removeAllListeners();
  }
}