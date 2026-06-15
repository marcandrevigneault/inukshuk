import { headingToCardinal } from '@lib/format';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Surface, Text, useTheme } from 'react-native-paper';

interface CompassBadgeProps {
  /** Heading in degrees clockwise from north, or null if unavailable. */
  heading: number | null;
}

/** A small floating compass that rotates its needle to the device heading. */
export function CompassBadge({ heading }: CompassBadgeProps) {
  const theme = useTheme();
  const deg = heading ?? 0;
  return (
    <Surface style={styles.surface} elevation={3}>
      <View style={styles.needleWrap}>
        <MaterialCommunityIcons
          name="navigation"
          size={26}
          color={theme.colors.tertiary}
          style={{ transform: [{ rotate: `${deg}deg` }] }}
        />
      </View>
      <Text variant="labelMedium" style={styles.label}>
        {heading === null ? '--' : `${Math.round(deg)}° ${headingToCardinal(deg)}`}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  needleWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontVariant: ['tabular-nums'],
  },
});
