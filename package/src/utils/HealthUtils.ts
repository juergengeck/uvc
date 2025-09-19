/**
 * Health utility functions
 */

export class HealthUtils {
  /**
   * Calculate BMI (Body Mass Index)
   */
  static calculateBMI(weightKg: number, heightM: number): number {
    if (heightM <= 0) {
      throw new Error('Height must be greater than 0');
    }
    return weightKg / (heightM * heightM);
  }

  /**
   * Get BMI category
   */
  static getBMICategory(bmi: number): string {
    if (bmi < 18.5) return 'Underweight';
    if (bmi < 25) return 'Normal weight';
    if (bmi < 30) return 'Overweight';
    if (bmi < 35) return 'Obese Class I';
    if (bmi < 40) return 'Obese Class II';
    return 'Obese Class III';
  }

  /**
   * Calculate maximum heart rate
   */
  static calculateMaxHeartRate(age: number): number {
    return 220 - age;
  }

  /**
   * Calculate target heart rate zone
   */
  static calculateTargetHeartRateZone(
    age: number,
    intensity: 'low' | 'moderate' | 'high' = 'moderate'
  ): { min: number; max: number } {
    const maxHR = this.calculateMaxHeartRate(age);
    
    switch (intensity) {
      case 'low':
        return { min: Math.round(maxHR * 0.5), max: Math.round(maxHR * 0.6) };
      case 'moderate':
        return { min: Math.round(maxHR * 0.6), max: Math.round(maxHR * 0.7) };
      case 'high':
        return { min: Math.round(maxHR * 0.7), max: Math.round(maxHR * 0.85) };
    }
  }

  /**
   * Calculate calories burned
   */
  static calculateCaloriesBurned(
    activity: string,
    durationMinutes: number,
    weightKg: number
  ): number {
    // MET values for common activities
    const metValues: Record<string, number> = {
      'walking': 3.5,
      'running': 8.0,
      'cycling': 6.0,
      'swimming': 7.0,
      'yoga': 2.5,
      'weight_training': 4.0,
      'dancing': 5.0,
      'hiking': 6.0,
      'basketball': 7.5,
      'soccer': 8.0,
      'tennis': 7.0,
      'golf': 3.5,
      'skiing': 7.0,
      'rowing': 6.0,
      'elliptical': 5.0
    };

    const met = metValues[activity.toLowerCase()] || 3.0;
    // Calories = MET × weight in kg × duration in hours
    return met * weightKg * (durationMinutes / 60);
  }

  /**
   * Calculate water intake recommendation (in liters)
   */
  static calculateWaterIntake(weightKg: number, activityLevel: 'low' | 'moderate' | 'high' = 'moderate'): number {
    // Base calculation: 30-35ml per kg
    let baseIntake = weightKg * 0.033; // 33ml per kg
    
    // Adjust for activity level
    switch (activityLevel) {
      case 'low':
        return baseIntake;
      case 'moderate':
        return baseIntake * 1.2;
      case 'high':
        return baseIntake * 1.5;
    }
  }

  /**
   * Calculate sleep debt
   */
  static calculateSleepDebt(actualHours: number, recommendedHours: number = 8): number {
    return Math.max(0, recommendedHours - actualHours);
  }

  /**
   * Get recommended daily steps by age
   */
  static getRecommendedDailySteps(age: number): number {
    if (age < 6) return 12000;
    if (age < 18) return 10000;
    if (age < 65) return 10000;
    return 7000; // Seniors
  }

  /**
   * Calculate pace (minutes per km)
   */
  static calculatePace(distanceKm: number, durationMinutes: number): number {
    if (distanceKm <= 0) {
      throw new Error('Distance must be greater than 0');
    }
    return durationMinutes / distanceKm;
  }

  /**
   * Format pace as MM:SS per km
   */
  static formatPace(paceMinutesPerKm: number): string {
    const minutes = Math.floor(paceMinutesPerKm);
    const seconds = Math.round((paceMinutesPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate distance from steps
   */
  static calculateDistanceFromSteps(steps: number, strideLength: number = 0.75): number {
    // strideLength in meters, returns distance in km
    return (steps * strideLength) / 1000;
  }

  /**
   * Check if blood pressure is normal
   */
  static isBloodPressureNormal(systolic: number, diastolic: number): {
    isNormal: boolean;
    category: string;
  } {
    if (systolic < 120 && diastolic < 80) {
      return { isNormal: true, category: 'Normal' };
    } else if (systolic < 130 && diastolic < 80) {
      return { isNormal: false, category: 'Elevated' };
    } else if (systolic < 140 || diastolic < 90) {
      return { isNormal: false, category: 'High Blood Pressure Stage 1' };
    } else if (systolic >= 140 || diastolic >= 90) {
      return { isNormal: false, category: 'High Blood Pressure Stage 2' };
    } else if (systolic > 180 || diastolic > 120) {
      return { isNormal: false, category: 'Hypertensive Crisis' };
    }
    return { isNormal: false, category: 'Unknown' };
  }

  /**
   * Calculate estimated VO2 Max
   */
  static calculateVO2Max(
    age: number,
    restingHeartRate: number,
    isMale: boolean
  ): number {
    // Using a simplified formula
    const baseVO2 = isMale ? 
      15.3 * (220 - age) / restingHeartRate :
      14.7 * (220 - age) / restingHeartRate;
    
    return Math.round(baseVO2 * 10) / 10;
  }

  /**
   * Get fitness level based on VO2 Max
   */
  static getFitnessLevel(vo2Max: number, age: number, isMale: boolean): string {
    // Simplified categorization
    const categories = isMale ? 
      [35, 40, 45, 51, 56] : // Male thresholds
      [31, 35, 39, 44, 49];  // Female thresholds

    const ageAdjustment = Math.floor((age - 20) / 10) * 2;
    const adjustedThresholds = categories.map(c => c - ageAdjustment);

    if (vo2Max < adjustedThresholds[0]) return 'Poor';
    if (vo2Max < adjustedThresholds[1]) return 'Fair';
    if (vo2Max < adjustedThresholds[2]) return 'Good';
    if (vo2Max < adjustedThresholds[3]) return 'Very Good';
    if (vo2Max < adjustedThresholds[4]) return 'Excellent';
    return 'Superior';
  }
}