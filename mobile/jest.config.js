module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEach: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@react-native-async-storage/async-storage|react-native-paper|react-native-safe-area-context|react-native-screens)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['**/__tests__/**/*.(ts|tsx|js)', '**/*.(test|spec).(ts|tsx|js)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**',
  ],
  moduleNameMapper: {
    '\\.svg': '<rootDir>/__mocks__/svgMock.js',
    '@react-native-async-storage/async-storage': '@react-native-async-storage/async-storage/jest/async-storage-mock',
    'expo-secure-store': '<rootDir>/__mocks__/expo-secure-store.js',
    'expo-apple-authentication': '<rootDir>/__mocks__/expo-apple-authentication.js',
    'expo-auth-session': '<rootDir>/__mocks__/expo-auth-session.js',
    'expo-web-browser': '<rootDir>/__mocks__/expo-web-browser.js',
    'expo-image-picker': '<rootDir>/__mocks__/expo-image-picker.js',
    'expo-notifications': '<rootDir>/__mocks__/expo-notifications.js',
  },
};
