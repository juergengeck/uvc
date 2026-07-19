module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  modulePaths: ['<rootDir>/node_modules'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.[jt]s?(x)'],
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!**/babel.config.js',
    '!**/jest.setup.js',
    '!packages/**',
    '!**/tmp/**',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/packages/',
    '/tmp/',
  ],
  moduleNameMapper: {
    '^@refinio/uvc.core$': '<rootDir>/../one/packages/uvc.core/dist/index.js',
    '^react-native$': 'react-native-web',
    '^react-native/Libraries/Animated/NativeAnimatedHelper$': '<rootDir>/node_modules/react-native-web/dist/modules/NativeAnimatedHelper',
  }
};
