/**
 * UV-C treatment parameters of the lab lamp.
 *
 * A treatment names the emission wavelength, the irradiance the lamp delivers
 * at the treated surface, the dose that surface must receive, and the lamp's
 * UV-C output. Exposure time is not an input: it follows from dose and
 * irradiance (1 mW/cm² = 10 W/m², and 1 W/m² for 1 s delivers 1 J/m²).
 *
 * Values are stored as integers in their smallest lab unit (µW/cm², mW) so
 * sub-mW/cm² room irradiances stay exact in ONE records.
 *
 * Runtime-import-free so jest and the worker bundle load this exact module.
 */

/** Common UV-C sources: far-UVC excimer, low-pressure mercury, and UV-C LEDs. */
export const UVC_WAVELENGTHS_NM = [222, 254, 265, 275] as const;

const MIN_WAVELENGTH_NM = 200;
const MAX_WAVELENGTH_NM = 280;
/** The lab runs cycles on a real-time clock; longer exposures belong to a real device. */
export const MAX_TREATMENT_DURATION_S = 3600;

export interface TreatmentParameters {
  title: string;
  wavelengthNm: number;
  /** Irradiance at the treated surface in µW/cm². */
  irradianceUwCm2: number;
  /** Required UV-C dose (fluence) at the treated surface in J/m². */
  targetDoseJm2: number;
  /** Lamp UV-C output in mW; metered as mJ per second of exposure. */
  lampPowerMw: number;
}

export interface Treatment extends TreatmentParameters {
  durationS: number;
}

/** The lamp's factory treatment: 3 mW/cm² = 30 W/m², so 10 s deliver 300 J/m². */
export const DEFAULT_TREATMENT: TreatmentParameters = {
  title: 'Demo room cleaning',
  wavelengthNm: 254,
  irradianceUwCm2: 3000,
  targetDoseJm2: 300,
  lampPowerMw: 3000,
};

function fail(message: string): never {
  throw new Error(`UVC lab: ${message}`);
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(`${field} must be a positive integer.`);
  return value as number;
}

/** Whole seconds of exposure until the target dose is reached. */
export function treatmentDurationS(targetDoseJm2: number, irradianceUwCm2: number): number {
  // 1 µW/cm² = 0.01 W/m².
  return Math.ceil((targetDoseJm2 * 100) / irradianceUwCm2);
}

/** Validates treatment parameters and derives the exposure time. */
export function treatment(input: TreatmentParameters): Treatment {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) fail('a treatment needs a title.');
  const wavelengthNm = positiveInteger(input.wavelengthNm, 'wavelengthNm');
  if (wavelengthNm < MIN_WAVELENGTH_NM || wavelengthNm > MAX_WAVELENGTH_NM) {
    fail(`wavelength must be UV-C between ${MIN_WAVELENGTH_NM} and ${MAX_WAVELENGTH_NM} nm.`);
  }
  const irradianceUwCm2 = positiveInteger(input.irradianceUwCm2, 'irradianceUwCm2');
  const targetDoseJm2 = positiveInteger(input.targetDoseJm2, 'targetDoseJm2');
  const lampPowerMw = positiveInteger(input.lampPowerMw, 'lampPowerMw');
  const durationS = treatmentDurationS(targetDoseJm2, irradianceUwCm2);
  if (durationS > MAX_TREATMENT_DURATION_S) {
    fail(`the exposure would take ${durationS} s; raise the irradiance or lower the dose to stay within ${MAX_TREATMENT_DURATION_S} s.`);
  }
  return { title, wavelengthNm, irradianceUwCm2, targetDoseJm2, lampPowerMw, durationS };
}

/** Irradiance for display: µW/cm² → mW/cm². */
export const mwCm2 = (irradianceUwCm2: number): number => irradianceUwCm2 / 1000;

export function describeTreatment(value: Treatment): string {
  return `${value.wavelengthNm} nm · ${mwCm2(value.irradianceUwCm2)} mW/cm² at target · `
    + `${value.targetDoseJm2} J/m² in ${value.durationS} s · lamp ${value.lampPowerMw / 1000} W UV-C`;
}
