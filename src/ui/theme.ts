import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/**
 * Inukshuk's visual identity is sampled directly from the app logo
 * (`assets/icon-source.png`): the charcoal stone figure, sage foliage, a slate
 * river, mountain grey and warm paper cream. These map onto React Native
 * Paper's Material Design 3 system so every component stays a standard,
 * well-documented Paper primitive — easy to maintain and theme.
 */

// Palette sampled from the logo. Surfaces use deepened variants of the logo's
// sage (#93A25E) and river (#5C93B7) so white text meets contrast on them.
const INUKSHUK = '#2D3740'; // charcoal-navy — the stone figure, our primary mark
const FOLIAGE_DEEP = '#566B33'; // deepened sage — green surfaces
const RIVER_DEEP = '#3E7BA0'; // deepened river — accents / route line
const STONE = '#8A8B8C'; // mountain grey
const CREAM = '#F2ECE0'; // warm paper — app background

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: FOLIAGE_DEEP,
    onPrimary: '#FFFFFF',
    primaryContainer: '#DCE8BC',
    onPrimaryContainer: '#18250A',
    secondary: INUKSHUK,
    onSecondary: '#FFFFFF',
    secondaryContainer: '#D6DBE0',
    onSecondaryContainer: '#161C22',
    tertiary: RIVER_DEEP,
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#CDE5F5',
    onTertiaryContainer: '#001E2E',
    background: CREAM,
    surface: '#FBF8F2',
    surfaceVariant: '#E3DDD0',
    outline: STONE,
    error: '#BA1A1A',
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#B6C98A',
    onPrimary: '#28340A',
    primaryContainer: '#3E5021',
    onPrimaryContainer: '#D2E5A4',
    secondary: '#B9C4CE',
    onSecondary: '#243039',
    secondaryContainer: '#3B4750',
    onSecondaryContainer: '#D6DBE0',
    tertiary: '#8FC0E4',
    onTertiary: '#00344D',
    tertiaryContainer: '#245068',
    onTertiaryContainer: '#C7E7FF',
    background: '#12150F',
    surface: '#1B1E17',
    surfaceVariant: '#43483E',
    outline: STONE,
    error: '#FFB4AB',
  },
};

/** Semantic colours used by the map HUD that aren't part of MD3. */
export const mapColors = {
  trail: RIVER_DEEP, // recorded GPX route — slate blue, like the logo's river
  trailGlow: 'rgba(62, 123, 160, 0.35)',
  userLocation: FOLIAGE_DEEP,
  pdfOverlayBorder: INUKSHUK,
};
