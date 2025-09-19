/**
 * Unit conversion utilities for health data
 */

export class UnitConversions {
  // Weight conversions
  static kgToLbs(kg: number): number {
    return kg * 2.20462;
  }

  static lbsToKg(lbs: number): number {
    return lbs / 2.20462;
  }

  static kgToStone(kg: number): number {
    return kg / 6.35029;
  }

  static stoneToKg(stone: number): number {
    return stone * 6.35029;
  }

  static gramsToOunces(grams: number): number {
    return grams * 0.035274;
  }

  static ouncesToGrams(ounces: number): number {
    return ounces / 0.035274;
  }

  // Height/Distance conversions
  static cmToInches(cm: number): number {
    return cm / 2.54;
  }

  static inchesToCm(inches: number): number {
    return inches * 2.54;
  }

  static metersToFeet(meters: number): number {
    return meters * 3.28084;
  }

  static feetToMeters(feet: number): number {
    return feet / 3.28084;
  }

  static kmToMiles(km: number): number {
    return km * 0.621371;
  }

  static milesToKm(miles: number): number {
    return miles / 0.621371;
  }

  static metersToYards(meters: number): number {
    return meters * 1.09361;
  }

  static yardsToMeters(yards: number): number {
    return yards / 1.09361;
  }

  // Temperature conversions
  static celsiusToFahrenheit(celsius: number): number {
    return (celsius * 9/5) + 32;
  }

  static fahrenheitToCelsius(fahrenheit: number): number {
    return (fahrenheit - 32) * 5/9;
  }

  static celsiusToKelvin(celsius: number): number {
    return celsius + 273.15;
  }

  static kelvinToCelsius(kelvin: number): number {
    return kelvin - 273.15;
  }

  // Volume conversions
  static litersToGallons(liters: number): number {
    return liters * 0.264172;
  }

  static gallonsToLiters(gallons: number): number {
    return gallons / 0.264172;
  }

  static mlToFlOz(ml: number): number {
    return ml * 0.033814;
  }

  static flOzToMl(flOz: number): number {
    return flOz / 0.033814;
  }

  static litersToQuarts(liters: number): number {
    return liters * 1.05669;
  }

  static quartsToLiters(quarts: number): number {
    return quarts / 1.05669;
  }

  // Energy conversions
  static calToKcal(cal: number): number {
    return cal / 1000;
  }

  static kcalToCal(kcal: number): number {
    return kcal * 1000;
  }

  static calToJoules(cal: number): number {
    return cal * 4.184;
  }

  static joulesToCal(joules: number): number {
    return joules / 4.184;
  }

  static kcalToKj(kcal: number): number {
    return kcal * 4.184;
  }

  static kjToKcal(kj: number): number {
    return kj / 4.184;
  }

  // Speed conversions
  static kmhToMph(kmh: number): number {
    return kmh * 0.621371;
  }

  static mphToKmh(mph: number): number {
    return mph / 0.621371;
  }

  static msToKmh(ms: number): number {
    return ms * 3.6;
  }

  static kmhToMs(kmh: number): number {
    return kmh / 3.6;
  }

  // Pace conversions
  static minPerKmToMinPerMile(minPerKm: number): number {
    return minPerKm * 1.60934;
  }

  static minPerMileToMinPerKm(minPerMile: number): number {
    return minPerMile / 1.60934;
  }

  // Blood glucose conversions
  static mgDlToMmolL(mgDl: number): number {
    return mgDl / 18.0182;
  }

  static mmolLToMgDl(mmolL: number): number {
    return mmolL * 18.0182;
  }

  // Blood pressure (no conversion needed, but for consistency)
  static mmHgToPascal(mmHg: number): number {
    return mmHg * 133.322;
  }

  static pascalToMmHg(pascal: number): number {
    return pascal / 133.322;
  }

  // BMI conversions
  static calculateBMIImperial(weightLbs: number, heightInches: number): number {
    return (weightLbs / (heightInches * heightInches)) * 703;
  }

  static calculateBMIMetric(weightKg: number, heightM: number): number {
    return weightKg / (heightM * heightM);
  }

  // Heart rate zones (percentage of max)
  static hrToPercentMax(hr: number, maxHr: number): number {
    return (hr / maxHr) * 100;
  }

  static percentMaxToHr(percent: number, maxHr: number): number {
    return (percent / 100) * maxHr;
  }

  // Helper functions for common conversions
  static convertHeight(value: number, fromUnit: 'cm' | 'inches' | 'feet', toUnit: 'cm' | 'inches' | 'feet'): number {
    // Convert to cm first
    let cm = value;
    if (fromUnit === 'inches') {
      cm = this.inchesToCm(value);
    } else if (fromUnit === 'feet') {
      cm = this.feetToMeters(value) * 100;
    }

    // Convert from cm to target unit
    if (toUnit === 'inches') {
      return this.cmToInches(cm);
    } else if (toUnit === 'feet') {
      return this.metersToFeet(cm / 100);
    }
    return cm;
  }

  static convertWeight(value: number, fromUnit: 'kg' | 'lbs' | 'stone', toUnit: 'kg' | 'lbs' | 'stone'): number {
    // Convert to kg first
    let kg = value;
    if (fromUnit === 'lbs') {
      kg = this.lbsToKg(value);
    } else if (fromUnit === 'stone') {
      kg = this.stoneToKg(value);
    }

    // Convert from kg to target unit
    if (toUnit === 'lbs') {
      return this.kgToLbs(kg);
    } else if (toUnit === 'stone') {
      return this.kgToStone(kg);
    }
    return kg;
  }

  static convertDistance(value: number, fromUnit: 'km' | 'miles' | 'meters' | 'yards', toUnit: 'km' | 'miles' | 'meters' | 'yards'): number {
    // Convert to meters first
    let meters = value;
    if (fromUnit === 'km') {
      meters = value * 1000;
    } else if (fromUnit === 'miles') {
      meters = this.milesToKm(value) * 1000;
    } else if (fromUnit === 'yards') {
      meters = this.yardsToMeters(value);
    }

    // Convert from meters to target unit
    if (toUnit === 'km') {
      return meters / 1000;
    } else if (toUnit === 'miles') {
      return this.kmToMiles(meters / 1000);
    } else if (toUnit === 'yards') {
      return this.metersToYards(meters);
    }
    return meters;
  }

  /**
   * Format value with unit
   */
  static formatWithUnit(value: number, unit: string, decimals: number = 1): string {
    return `${value.toFixed(decimals)} ${unit}`;
  }

  /**
   * Get display unit based on locale
   */
  static getDisplayUnit(metricUnit: string, locale: string = 'en-US'): string {
    const imperialLocales = ['en-US', 'en-GB'];
    const isImperial = imperialLocales.includes(locale);

    const unitMap: Record<string, string> = {
      'kg': isImperial ? 'lbs' : 'kg',
      'cm': isImperial ? 'inches' : 'cm',
      'km': isImperial ? 'miles' : 'km',
      'celsius': isImperial ? '°F' : '°C',
      'liters': isImperial ? 'gallons' : 'L',
      'kmh': isImperial ? 'mph' : 'km/h'
    };

    return unitMap[metricUnit] || metricUnit;
  }
}