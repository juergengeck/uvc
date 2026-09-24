import { describe, expect, it } from '@jest/globals';
import { labThemeIsDark, nextLabThemeMode, parseLabThemeMode } from '../theme';

describe('lab appearance', () => {
  it('cycles light, dark, and system and resolves the system preference', () => {
    expect(nextLabThemeMode('light')).toBe('dark');
    expect(nextLabThemeMode('dark')).toBe('system');
    expect(nextLabThemeMode('system')).toBe('light');
    expect(labThemeIsDark('system', true)).toBe(true);
    expect(labThemeIsDark('system', false)).toBe(false);
    expect(labThemeIsDark('light', true)).toBe(false);
    expect(labThemeIsDark('dark', false)).toBe(true);
  });

  it('accepts only persisted theme modes', () => {
    expect(parseLabThemeMode('dark')).toBe('dark');
    expect(parseLabThemeMode('system')).toBe('system');
    expect(parseLabThemeMode('invalid')).toBeNull();
    expect(parseLabThemeMode(null)).toBeNull();
  });
});
