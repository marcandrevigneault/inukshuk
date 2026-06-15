import type { TrackStats } from '@core/models';
import { formatDistance, formatDuration, formatElevation, formatSpeed } from '@lib/format';
import { StatTile } from '@ui/components/StatTile';
import { StyleSheet, View } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';

interface StatsHudProps {
  name: string;
  stats: TrackStats;
  /** Live wall-clock duration in seconds (ticks independently of GPS fixes). */
  elapsedS: number;
  paused: boolean;
}

/** The bottom HUD card shown while recording: time, distance, D+, D-, speed. */
export function StatsHud({ name, stats, elapsedS, paused }: StatsHudProps) {
  const theme = useTheme();
  return (
    <Surface style={styles.card} elevation={4}>
      <View style={styles.header}>
        <Text variant="titleSmall" numberOfLines={1} style={styles.title}>
          {name}
        </Text>
        {paused ? (
          <Text variant="labelSmall" style={{ color: theme.colors.tertiary }}>
            PAUSED
          </Text>
        ) : (
          <View style={[styles.dot, { backgroundColor: theme.colors.error }]} />
        )}
      </View>
      <View style={styles.row}>
        <StatTile label="Time" value={formatDuration(elapsedS)} />
        <StatTile label="Distance" value={formatDistance(stats.distanceM)} />
        <StatTile label="Speed" value={formatSpeed(stats.avgSpeedMps)} />
      </View>
      <View style={styles.row}>
        <StatTile label="D+" value={formatElevation(stats.ascentM)} color={theme.colors.primary} />
        <StatTile label="D-" value={formatElevation(stats.descentM)} color={theme.colors.error} />
        <StatTile
          label="Max alt"
          value={stats.maxAltitudeM !== undefined ? formatElevation(stats.maxAltitudeM) : '--'}
        />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  title: {
    flex: 1,
    fontWeight: '700',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});
