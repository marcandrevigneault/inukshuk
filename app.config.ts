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
  owner: 'pythagorasv02',
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
      // v1 records in the foreground only (screen kept awake), so no background
      // location mode is declared — keeps store review simple.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.inukshuk.app',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundColor: '#0B3D2E',
    },
    // Foreground-only location in v1 — no background or foreground-service
    // location permissions, which avoids Play's stricter background-location
    // review.
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
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
        locationWhenInUsePermission:
          'Inukshuk uses your location to show where you are on the map and to record your trail.',
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
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
      projectId: process.env.EAS_PROJECT_ID ?? 'ba200eac-11b2-4c40-bd17-c0c66351ea54',
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
