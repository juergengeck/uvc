// Mock react-native modules
jest.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  StyleSheet: {
    create: jest.fn(),
  },
}));

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => ({
  PanGestureHandler: 'PanGestureHandler',
  State: {},
}));

// Mock expo-font
jest.mock('@expo/vector-icons', () => ({
  Ionicons: null,
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
); 