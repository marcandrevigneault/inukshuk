import { buildElevationProfile } from '@core/geo/track';
import type { TrackPoint } from '@core/models';
import { formatDistance, formatElevation } from '@lib/format';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

const CHART_HEIGHT = 120;
const BAR_MIN_H = 4;

interface Props {
  points: readonly TrackPoint[];
  ascentM: number;
  descentM: number;
}

/**
 * Elevation-vs-distance profile drawn as a filled silhouette of thin bars — no
 * charting dependency, just themed Views. Touch and drag to scrub: the nearest
 * sample's elevation and distance are read out above the graph.
 */
export function ElevationProfile({ points, ascentM, descentM }: Props) {
  const theme = useTheme();
  const profile = useMemo(() => buildElevationProfile(points), [points]);
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  if (!profile.hasElevation) {
    return (
      <View style={styles.empty}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          No elevation data was recorded for this trail.
        </Text>
      </View>
    );
  }

  const { samples, minElevationM, maxElevationM, totalDistanceM } = profile;
  const range = maxElevationM - minElevationM;
  const lastIdx = samples.length - 1;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onTouch = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
    setScrub(Math.round(ratio * lastIdx));
  };

  const active = scrub === null ? null : samples[scrub]!;
  const cursorLeft = scrub === null ? 0 : (scrub / lastIdx) * width;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="labelMedium">↑ {formatElevation(ascentM)}</Text>
        <Text variant="labelMedium">↓ {formatElevation(descentM)}</Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatElevation(minElevationM)} – {formatElevation(maxElevationM)}
        </Text>
      </View>

      <View style={styles.readout}>
        {active ? (
          <Text variant="bodySmall" style={{ color: theme.colors.primary }}>
            {formatElevation(active.elevationM)} @ {formatDistance(active.distanceM)}
          </Text>
        ) : (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Touch the graph to read elevation
          </Text>
        )}
      </View>

      <View
        style={[styles.chart, { backgroundColor: theme.colors.surfaceVariant }]}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={() => setScrub(null)}
        onResponderTerminate={() => setScrub(null)}
      >
        {samples.map((s, i) => {
          const norm = range === 0 ? 0.5 : (s.elevationM - minElevationM) / range;
          const isActive = scrub === i;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: BAR_MIN_H + norm * (CHART_HEIGHT - BAR_MIN_H),
                backgroundColor: isActive ? theme.colors.primary : theme.colors.tertiary,
                opacity: scrub === null || isActive ? 1 : 0.7,
              }}
            />
          );
        })}
        {scrub !== null && (
          <View
            style={[styles.cursor, { left: cursorLeft, backgroundColor: theme.colors.primary }]}
            pointerEvents="none"
          />
        )}
      </View>

      <View style={styles.axisRow}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          0
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDistance(totalDistanceM)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 10, gap: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readout: { minHeight: 18 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { padding: 12 },
});
