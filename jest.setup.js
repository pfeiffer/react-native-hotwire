// The library's own native module and view, which no test needs for real; every other
// Expo module keeps jest-expo's mocks.
jest.mock('expo-modules-core', () => {
  const actual = jest.requireActual('expo-modules-core');
  const hotwire = {
    loadPathConfiguration: jest.fn(async () => {}),
    getPathConfigurationSettings: jest.fn(async () => ({})),
    getPathProperties: jest.fn(async () => ({})),
    getSessionHandles: jest.fn(async () => []),
    reloadSession: jest.fn(async () => {}),
    refreshSession: jest.fn(async () => {}),
    clearSessionSnapshotCache: jest.fn(async () => {}),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  return {
    ...actual,
    requireNativeModule: (name) => (name === 'Hotwire' ? hotwire : actual.requireNativeModule(name)),
    requireNativeViewManager: (name) => (name === 'Hotwire' ? () => null : actual.requireNativeViewManager(name)),
  };
});
