import { buildElevationProfile } from '@core/geo/track';
import type { TrackPoint } from '@core/models';
import { formatDistance, formatElevation } from '@lib/format';
import { useSettingsStore } from '@state/settingsStore';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { SegmentedButtons, Text, useTheme } from 'react-native-paper';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

const CHART_HEIGHT = 140;
const H_GRID = 4; // horizontal grid divisions
const V_GRID = 6; // vertical grid divisions

interface Props {
  points: readonly TrackPoint[];
  ascentM: number;
  descentM: number;
}

/** Build SVG path `d` strings (line + closed area) from screen-space points. */
function buildPaths(
  pts: { x: number; y: number }[],
  height: number,
): { line: string; area: string } {
  if (pts.length < 2) return { line: '', area: '' };
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${pts[pts.length - 1]!.x.toFixed(1)} ${height} L${pts[0]!.x.toFixed(1)} ${height} Z`;
  return { line, area };
}

/**
 * Elevation-vs-distance profile rendered with react-native-svg: a smooth line
 * with a gradient fill or a grid backdrop (user-selectable, persisted). Touch and
 * drag to scrub — a marker rides the line and the readout shows elevation,
 * distance and grade at that point.
 */
export function ElevationProfile({ points, ascentM, descentM }: Props) {
  const theme = useTheme();
  const profile = useMemo(() => buildElevationProfile(points), [points]);
  const style = useSettingsStore((s) => s.elevationProfileStyle);
  const setStyle = useSettingsStore((s) => s.set);
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  const styleSelector = (
    <SegmentedButtons
      value={style}
      onValueChange={(v) => setStyle('elevationProfileStyle', v as 'gradient' | 'grid')}
      density="small"
      buttons={[
        { value: 'gradient', label: 'Gradient', icon: 'chart-areaspline' },
        { value: 'grid', label: 'Grid', icon: 'grid' },
        { value: '3d', label: '3D', icon: 'video-3d', disabled: true },
      ]}
    />
  );

  if (!profile.hasElevation) {
    return (
      <View style={styles.container}>
        {styleSelector}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          No elevation data was recorded for this trail.
        </Text>
      </View>
    );
  }

  const { samples, minElevationM, maxElevationM, totalDistanceM } = profile;
  const range = maxElevationM - minElevationM || 1;
  const lastIdx = samples.length - 1;

  const pts =
    width > 0
      ? samples.map((s) => ({
          x: (s.distanceM / (totalDistanceM || 1)) * width,
          y: CHART_HEIGHT - ((s.elevationM - minElevationM) / range) * (CHART_HEIGHT - 6) - 3,
        }))
      : [];
  const paths = buildPaths(pts, CHART_HEIGHT);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onTouch = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
    setScrub(Math.round(ratio * lastIdx));
  };

  const active = scrub === null ? null : samples[scrub]!;
  const marker = scrub === null ? null : pts[scrub];
  // Grade between the scrubbed sample and the previous one.
  const grade =
    scrub === null || scrub === 0
      ? null
      : (() => {
          const a = samples[scrub - 1]!;
          const b = samples[scrub]!;
          const dd = b.distanceM - a.distanceM;
          return dd > 0 ? ((b.elevationM - a.elevationM) / dd) * 100 : 0;
        })();

  const lineColor = theme.colors.primary;

  return (
    <View style={styles.container}>
      {styleSelector}

      <View style={styles.headerRow}>
        <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
          ↑ {formatElevation(ascentM)}
        </Text>
        <Text variant="labelMedium" style={{ color: theme.colors.error }}>
          ↓ {formatElevation(descentM)}
        </Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatElevation(minElevationM)}–{formatElevation(maxElevationM)}
        </Text>
      </View>

      <View style={styles.readout}>
        {active ? (
          <Text variant="bodySmall" style={{ color: theme.colors.primary }}>
            {formatElevation(active.elevationM)} @ {formatDistance(active.distanceM)}
            {grade !== null ? ` · ${grade >= 0 ? '+' : ''}${grade.toFixed(0)}%` : ''}
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
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.45} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0.04} />
              </LinearGradient>
            </Defs>

            {style === 'grid' &&
              Array.from({ length: H_GRID + 1 }, (_, i) => {
                const y = (i / H_GRID) * CHART_HEIGHT;
                return (
                  <Line
                    key={`h${i}`}
                    x1={0}
                    y1={y}
                    x2={width}
                    y2={y}
                    stroke={theme.colors.onSurfaceVariant}
                    strokeWidth={0.5}
                    opacity={0.25}
                  />
                );
              })}
            {style === 'grid' &&
              Array.from({ length: V_GRID + 1 }, (_, i) => {
                const x = (i / V_GRID) * width;
                return (
                  <Line
                    key={`v${i}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={CHART_HEIGHT}
                    stroke={theme.colors.onSurfaceVariant}
                    strokeWidth={0.5}
                    opacity={0.25}
                  />
                );
              })}

            {style === 'gradient' && <Path d={paths.area} fill="url(#elevFill)" />}
            <Path d={paths.line} stroke={lineColor} strokeWidth={2} fill="none" />

            {marker && (
              <>
                <Line
                  x1={marker.x}
                  y1={0}
                  x2={marker.x}
                  y2={CHART_HEIGHT}
                  stroke={lineColor}
                  strokeWidth={1}
                  opacity={0.5}
                />
                <Circle
                  cx={marker.x}
                  cy={marker.y}
                  r={5}
                  fill={lineColor}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              </>
            )}
          </Svg>
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
  container: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10, gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readout: { minHeight: 18 },
  chart: { height: CHART_HEIGHT, borderRadius: 10, overflow: 'hidden' },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
