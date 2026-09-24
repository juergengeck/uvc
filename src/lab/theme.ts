export type LabThemeMode = 'light' | 'dark' | 'system';

const modes: LabThemeMode[] = ['light', 'dark', 'system'];

export function parseLabThemeMode(value: string | null): LabThemeMode | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

export function nextLabThemeMode(mode: LabThemeMode): LabThemeMode {
  return modes[(modes.indexOf(mode) + 1) % modes.length];
}

export function labThemeIsDark(mode: LabThemeMode, systemDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemDark);
}
