import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Inukshuk — offline georeferenced-PDF trail navigation.
 *
 * Dynamic config so we can wire EAS project id / OTA channels from the
 * environment in CI without committing secrets. See docs/ARCHITECTURE.md.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Inukshuk',
  slug: 'inukshuk',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'inukshuk',
  userInterfaceStyle: 'automatic',
  // New Architecture is the default in SDK 56; splash is configured via the
  // expo-splash-screen plugin below (top-level `splash` was removed in SDK 56).
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.inukshuk.app',
    infoPlist: {
      // Background location is required to keep recording a track while the
      // screen is locked during a hike.
      UIBackgroundModes: ['location'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.inukshuk.app',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: '#0B3D2E',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-sqlite',
    'expo-sharing',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        backgroundColor: '#0B3D2E',
        imageWidth: 180,
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Inukshuk uses your location to show where you are on the map and to record your trail.',
        locationWhenInUsePermission:
          'Inukshuk uses your location to show where you are on the map and to record your trail.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      '@maplibre/maplibre-react-native',
      {
        // We render OpenStreetMap raster tiles, so no proprietary SDK token.
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '00000000-0000-0000-0000-000000000000',
    },
  },
  updates: {
    // OTA self-correction channel; CI publishes JS-only fixes here.
    url: process.env.EAS_UPDATE_URL,
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
});
