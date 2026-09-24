import { DEFAULT_TREATMENT, describeTreatment, treatment, treatmentDurationS } from '../treatment.ts';

describe('UV-C treatment', () => {
  it('derives exposure time from dose and irradiance', () => {
    // 3 mW/cm² = 30 W/m²: 300 J/m² take 10 s.
    expect(treatmentDurationS(300, 3000)).toBe(10);
    // 0.25 mW/cm² = 2.5 W/m²: 100 J/m² take 40 s.
    expect(treatmentDurationS(100, 250)).toBe(40);
    // Partial seconds round up so the full dose is delivered.
    expect(treatmentDurationS(100, 3000)).toBe(4);
  });

  it('validates the factory treatment and describes it', () => {
    const value = treatment(DEFAULT_TREATMENT);
    expect(value.durationS).toBe(10);
    expect(describeTreatment(value)).toBe('254 nm · 3 mW/cm² at target · 300 J/m² in 10 s · lamp 3 W UV-C');
  });

  it('rejects wavelengths outside UV-C, non-integers, and exposures beyond the lab clock', () => {
    expect(() => treatment({ ...DEFAULT_TREATMENT, wavelengthNm: 365 })).toThrow('UV-C between 200 and 280 nm');
    expect(() => treatment({ ...DEFAULT_TREATMENT, irradianceUwCm2: 2.5 })).toThrow('irradianceUwCm2 must be a positive integer');
    expect(() => treatment({ ...DEFAULT_TREATMENT, title: ' ' })).toThrow('needs a title');
    expect(() => treatment({ ...DEFAULT_TREATMENT, irradianceUwCm2: 1, targetDoseJm2: 100 })).toThrow('within 3600 s');
  });
});
