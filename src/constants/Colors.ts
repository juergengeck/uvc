const tintColorLight = '#22c55e';
const tintColorDark = '#16a34a';

export const Colors = {
  light: {
    // MD3 Base colors
    primary: tintColorLight,
    primaryContainer: '#E5F2FF',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#001D36',
    
    secondary: '#535F70',
    secondaryContainer: '#D6E4F7',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#101C2B',
    
    // Surface colors
    background: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceVariant: '#E1E2EC',
    onSurface: '#1C1B1F',
    onSurfaceVariant: '#44474F',
    
    // Card and container colors
    card: '#FFFFFF',
    cardAlt: '#F8F9FA',
    
    // Text colors
    text: '#000000',
    textPrimary: '#000000',
    textSecondary: '#8E8E93',
    textTertiary: '#C5C5C7',
    textInverse: '#FFFFFF',
    
    // Border and divider colors
    border: '#C6C6C8',
    divider: '#E5E5EA',
    outline: '#C6C6C8',
    outlineVariant: '#E5E5EA',
    
    // Status colors
    success: '#4CD964',
    error: '#FF3B30',
    warning: '#FF9500',
    info: '#22c55e',
    
    // Notification colors
    notification: '#FF3B30',
    
    // Overlay colors
    scrim: 'rgba(0, 0, 0, 0.25)',
    modalBackground: 'rgba(0, 0, 0, 0.5)',
  },
  dark: {
    // MD3 Base colors
    primary: tintColorDark,
    primaryContainer: '#004881',
    onPrimary: '#FFFFFF',
    onPrimaryContainer: '#D1E4FF',
    
    secondary: '#BBC7DB',
    secondaryContainer: '#3B4858',
    onSecondary: '#253140',
    onSecondaryContainer: '#D6E4F7',
    
    // Surface colors
    background: '#000000',
    surface: '#1C1C1E',
    surfaceVariant: '#2C2C2E',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#E3E3E8',
    
    // Card and container colors
    card: '#1C1C1E',
    cardAlt: '#2C2C2E',
    
    // Text colors
    text: '#FFFFFF',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A5',
    textTertiary: '#68686A',
    textInverse: '#000000',
    
    // Border and divider colors
    border: '#38383A',
    divider: '#2C2C2E',
    outline: '#38383A',
    outlineVariant: '#2C2C2E',
    
    // Status colors
    success: '#32D74B',
    error: '#FF453A',
    warning: '#FF9F0A',
    info: '#16a34a',
    
    // Notification colors
    notification: '#FF453A',
    
    // Overlay colors
    scrim: 'rgba(0, 0, 0, 0.5)',
    modalBackground: 'rgba(0, 0, 0, 0.7)',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ColorToken = keyof typeof Colors.light & keyof typeof Colors.dark;

// Extend the MD3Colors type to include our custom colors
declare module 'react-native-paper' {
  export interface MD3Colors {
    textSecondary: string;
    textTertiary: string;
    textInverse: string;
    cardAlt: string;
    divider: string;
  }
}

export default Colors;
