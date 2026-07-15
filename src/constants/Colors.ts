const brandGreen = '#2bb442';
const tintColorLight = brandGreen;
const tintColorDark = '#5fe16f';

export const Colors = {
  light: {
    // MD3 Base colors
    primary: tintColorLight,
    primaryContainer: '#d9f3df',
    onPrimary: '#061b0a',
    onPrimaryContainer: '#061b0a',
    
    secondary: '#5c675f',
    secondaryContainer: '#e3e7df',
    onSecondary: '#FFFFFF',
    onSecondaryContainer: '#1a211d',
    
    // Surface colors
    background: '#f8f6f1',
    surface: '#fbfaf7',
    surfaceVariant: '#eee9df',
    surfaceRaised: '#fdfcf9',
    surfaceSunken: '#f1ede4',
    onBackground: '#24231f',
    onSurface: '#24231f',
    onSurfaceVariant: '#5f5b52',
    
    // Card and container colors
    card: '#fdfcf9',
    cardAlt: '#f1ede4',
    userBubble: '#eee7dc',
    userBubbleForeground: '#24231f',
    
    // Text colors
    text: '#24231f',
    textPrimary: '#24231f',
    textSecondary: '#6d685f',
    textTertiary: '#918a7e',
    textInverse: '#FFFFFF',
    
    // Border and divider colors
    border: '#ddd5c9',
    divider: '#e9e2d7',
    outline: '#c9bfb1',
    outlineVariant: '#e3dbcf',
    
    // Status colors
    success: brandGreen,
    error: '#ba1a1a',
    errorContainer: '#ffdad6',
    onError: '#ffffff',
    onErrorContainer: '#410002',
    warning: '#9a6200',
    info: '#1c6e8c',
    
    // Notification colors
    notification: '#ba1a1a',
    
    // Overlay colors
    scrim: 'rgba(36, 35, 31, 0.25)',
    backdrop: 'rgba(36, 35, 31, 0.25)',
    modalBackground: 'rgba(36, 35, 31, 0.5)',
  },
  dark: {
    // MD3 Base colors
    primary: tintColorDark,
    primaryContainer: '#0f4f1d',
    onPrimary: '#052109',
    onPrimaryContainer: '#d9f3df',
    
    secondary: '#c4ccc2',
    secondaryContainer: '#354139',
    onSecondary: '#29312c',
    onSecondaryContainer: '#e0e8de',
    
    // Surface colors
    background: '#181512',
    surface: '#1f1b17',
    surfaceVariant: '#2e2822',
    surfaceRaised: '#25211c',
    surfaceSunken: '#14110f',
    onBackground: '#f0e9df',
    onSurface: '#f0e9df',
    onSurfaceVariant: '#cfc5b8',
    
    // Card and container colors
    card: '#25211c',
    cardAlt: '#2e2822',
    userBubble: '#3a3128',
    userBubbleForeground: '#f0e9df',
    
    // Text colors
    text: '#f0e9df',
    textPrimary: '#f0e9df',
    textSecondary: '#cfc5b8',
    textTertiary: '#a99f92',
    textInverse: '#181512',
    
    // Border and divider colors
    border: '#3a332c',
    divider: '#302a24',
    outline: '#5f554a',
    outlineVariant: '#39322b',
    
    // Status colors
    success: tintColorDark,
    error: '#ffb4ab',
    errorContainer: '#93000a',
    onError: '#690005',
    onErrorContainer: '#ffdad6',
    warning: '#ffcb6b',
    info: '#87d2eb',
    
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
