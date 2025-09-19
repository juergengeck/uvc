import { useColorScheme as useNativeColorScheme } from 'react-native';

/**
 * Returns the current color scheme ('dark' or 'light')
 * Defaults to 'light' if no color scheme is detected
 */
export default function useColorScheme() {
  return useNativeColorScheme() ?? 'light';
} 