// Global Jest setup.
//
// @testing-library/react-native v14 ships its own matchers, so we only need to
// register lightweight native-module mocks that some libraries touch at import
// time. Pure-logic tests under src/core need none of this but it is harmless.

// Silence noisy native warnings during tests.
jest.spyOn(console, 'warn').mockImplementation(() => {});
