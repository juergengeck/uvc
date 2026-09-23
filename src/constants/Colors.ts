const actionGreenLight = '#24543d';
const actionGreenDark = '#a8cdb3';
const successGreenLight = '#28634b';
const successGreenDark = '#9cc8ae';

export const Colors = {
  light: {
    // MD3 Base colors
    primary: actionGreenLight,
    primaryContainer: '#dcecdf',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#244530',
    
    secondary: '#626d79',
    secondaryContainer: '#e8ecef',
    onSecondary: '#ffffff',
    onSecondaryContainer: '#242c35',
    
    // Surface colors
    background: '#f5f6f7',
    surface: '#ffffff',
    surfaceVariant: '#eef1f3',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#eef1f3',
    onBackground: '#242c35',
    onSurface: '#242c35',
    onSurfaceVariant: '#626d79',
    
    // Card and container colors
    card: '#ffffff',
    cardAlt: '#eef1f3',
    userBubble: '#e8edf1',
    userBubbleForeground: '#242c35',
    
    // Text colors
    text: '#242c35',
    textPrimary: '#242c35',
    textSecondary: '#626d79',
    textTertiary: '#818b96',
    textInverse: '#ffffff',
    
    // Border and divider colors
    border: '#e0e4e8',
    divider: '#e8ebee',
    outline: '#b7c0c8',
    outlineVariant: '#e0e4e8',
    
    // Status colors
    success: successGreenLight,
    error: '#ba1a1a',
    errorContainer: '#ffdad6',
    onError: '#ffffff',
    onErrorContainer: '#410002',
    warning: '#9a6200',
    info: actionGreenLight,
    
    // Notification colors
    notification: '#ba1a1a',
    
    // Overlay colors
    scrim: 'rgba(36, 44, 53, 0.25)',
    backdrop: 'rgba(36, 44, 53, 0.25)',
    modalBackground: 'rgba(36, 44, 53, 0.5)',
  },
  dark: {
    // MD3 Base colors
    primary: actionGreenDark,
    primaryContainer: '#2b4635',
    onPrimary: '#172c20',
    onPrimaryContainer: '#dcecdf',
    
    secondary: '#a1aab4',
    secondaryContainer: '#343a41',
    onSecondary: '#202428',
    onSecondaryContainer: '#e4e8ec',
    
    // Surface colors
    background: '#191c20',
    surface: '#202428',
    surfaceVariant: '#2b3036',
    surfaceRaised: '#252a2f',
    surfaceSunken: '#171a1e',
    onBackground: '#e4e8ec',
    onSurface: '#e4e8ec',
    onSurfaceVariant: '#a1aab4',
    
    // Card and container colors
    card: '#202428',
    cardAlt: '#2b3036',
    userBubble: '#303942',
    userBubbleForeground: '#e4e8ec',
    
    // Text colors
    text: '#e4e8ec',
    textPrimary: '#e4e8ec',
    textSecondary: '#a1aab4',
    textTertiary: '#7f8994',
    textInverse: '#191c20',
    
    // Border and divider colors
    border: '#363c43',
    divider: '#30363c',
    outline: '#626c76',
    outlineVariant: '#363c43',
    
    // Status colors
    success: successGreenDark,
    error: '#ffb4ab',
    errorContainer: '#93000a',
    onError: '#690005',
    onErrorContainer: '#ffdad6',
    warning: '#ffcb6b',
    info: actionGreenDark,
    
    // Notification colors
    notification: '#ffb4ab',
    
    // Overlay colors
    scrim: 'rgba(0, 0, 0, 0.5)',
    backdrop: 'rgba(0, 0, 0, 0.5)',
    modalBackground: 'rgba(0, 0, 0, 0.7)',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ColorToken = keyof typeof Colors.light & keyof typeof Colors.dark;

// Extend the MD3Colors type to include our custom colors
declare module 'react-native-paper' {
  export interface MD3Colors {
    brandPrimary: string;
    text: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textInverse: string;
    card: string;
    cardAlt: string;
    border: string;
    divider: string;
    success: string;
    warning: string;
    info: string;
    surfaceRaised: string;
    surfaceSunken: string;
    userBubble: string;
    userBubbleForeground: string;
    modalBackground: string;
  }
}

export default Colors;
