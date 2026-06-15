import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/**
 * Inukshuk's visual identity: a calm forest-green and warm trail-orange palette on
 * top of React Native Paper's Material Design 3 system, so every component is a
 * standard, well-documented Paper primitive — easy to maintain and theme.
 */

const FOREST = '#0B3D2E'; // deep pine — primary brand colour
const FOREST_LIGHT = '#2E7D5B';
const TRAIL = '#E8852B'; // trail-marker orange — accents / record button
const SAND = '#F4EFE6';

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: FOREST,
    onPrimary: '#FFFFFF',
    primaryContainer: '#A7F0C9',
    onPrimaryContainer: '#00210F',
    secondary: FOREST_LIGHT,
    tertiary: TRAIL,
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#FFDCC2',
    onTertiaryContainer: '#311300',
    background: SAND,
    surface: '#FFFFFF',
    error: '#BA1A1A',
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#7FD6A6',
    onPrimary: '#00391E',
    primaryContainer: '#0A5234',
    onPrimaryContainer: '#A7F0C9',
    secondary: '#8FD3AE',
    tertiary: '#FFB77C',
    onTertiary: '#4A2400',
    tertiaryContainer: '#6B3A12',
    onTertiaryContainer: '#FFDCC2',
    background: '#10140F',
    surface: '#191D17',
    error: '#FFB4AB',
  },
};

/** Semantic colours used by the map HUD that aren't part of MD3. */
export const mapColors = {
  trail: TRAIL,
  trailGlow: 'rgba(232, 133, 43, 0.35)',
  userLocation: FOREST,
  pdfOverlayBorder: FOREST,
};
