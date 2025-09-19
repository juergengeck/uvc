module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!**/babel.config.js',
    '!**/jest.setup.js',
    '!**/tmp/**',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tmp/',
  ],
  moduleNameMapper: {
    '^react-native$': 'react-native-web',
    '^react-native/Libraries/Animated/NativeAnimatedHelper$': '<rootDir>/node_modules/react-native-web/dist/modules/NativeAnimatedHelper',
  }
}; 