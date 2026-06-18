import {
  buildElevationProfile,
  interpolateTrackAtDistance,
  type TrackPointAt,
} from '@core/geo/track';
import type { TrackPoint } from '@core/models';
import { formatDistance, formatElevation, formatSpeed } from '@lib/format';
import { Fragment, useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

const CHART_HEIGHT = 140;

interface Props {
  points: readonly TrackPoint[];
  ascentM: number;
  descentM: number;
  /**
   * Reports the scrubbed position along the track (or null when released) so a
   * caller can sync a map marker. Computed from `points` via arc-length interp.
   */
  onScrub?: (at: TrackPointAt | null) => void;
  /** Persistent numbered note pins to draw along the profile (GPX editor). */
  markers?: readonly { distanceM: number; label: string }[];
  /** A persistent dashed cursor, e.g. where a new note will be anchored. */
  selectedDistanceM?: number | null;
}

/** Pace colour ramp: 0 = slow (red) → 0.5 = amber → 1 = fast (green). */
function paceColor(t: number): string {
  const stops = [
    [0xd7, 0x30, 0x27],
    [0xfd, 0xae, 0x61],
    [0x1a, 0x98, 0x50],
  ];
  const x = Math.max(0, Math.min(1, t));
  const seg = x < 0.5 ? 0 : 1;
  const local = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  const a = stops[seg]!;
  const b = stops[seg + 1]!;
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * local));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
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
export function ElevationProfile({
  points,
  ascentM,
  descentM,
  onScrub,
  markers = [],
  selectedDistanceM = null,
}: Props) {
  const theme = useTheme();
  const profile = useMemo(() => buildElevationProfile(points), [points]);
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [scrubAt, setScrubAt] = useState<TrackPointAt | null>(null);

  // Speed at each profile sample (for the 'pace' colouring), + its range.
  const speeds = useMemo(
    () =>
      profile.hasElevation
        ? profile.samples.map((s) => interpolateTrackAtDistance(points, s.distanceM)?.speed)
        : [],
    [points, profile],
  );
  const speedRange = useMemo(() => {
    const vals = speeds.filter((v): v is number => v !== undefined && Number.isFinite(v) && v >= 0);
    if (vals.length < 2) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of vals) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return hi > lo ? { lo, hi } : null;
  }, [speeds]);

  if (!profile.hasElevation) {
    return (
      <View style={styles.container}>
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
  const xFor = (d: number) =>
    (Math.max(0, Math.min(d, totalDistanceM)) / (totalDistanceM || 1)) * width;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onTouch = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
    const idx = Math.round(ratio * lastIdx);
    setScrub(idx);
    const at = interpolateTrackAtDistance(points, samples[idx]!.distanceM);
    setScrubAt(at);
    onScrub?.(at);
  };
  const endScrub = () => {
    setScrub(null);
    setScrubAt(null);
    onScrub?.(null);
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
            {scrubAt?.speed !== undefined ? ` · ${formatSpeed(scrubAt.speed)}` : ''}
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
        onMoveShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        onMoveShouldSetResponderCapture={() => true}
        // Keep the gesture until the finger lifts — vertical motion must not hand
        // the touch to the surrounding ScrollView and cancel scrubbing.
        onResponderTerminationRequest={() => false}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={endScrub}
        onResponderTerminate={endScrub}
      >
        {width > 0 && (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              {/* Pace fill: a horizontal gradient coloured by speed at each sample
                  (red slow → green fast), painting the whole elevation area. */}
              {speedRange && (
                <LinearGradient
                  id="paceFill"
                  x1="0"
                  y1="0"
                  x2={width}
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  {samples.map((s, i) => {
                    const sp = speeds[i];
                    const t =
                      sp === undefined
                        ? 0.5
                        : (sp - speedRange.lo) / (speedRange.hi - speedRange.lo);
                    return (
                      <Stop
                        key={`p${i}`}
                        offset={s.distanceM / (totalDistanceM || 1)}
                        stopColor={paceColor(t)}
                        stopOpacity={0.92}
                      />
                    );
                  })}
                </LinearGradient>
              )}
              <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.6} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0.28} />
              </LinearGradient>
            </Defs>

            {/* Solid fill: pace gradient when speed is known, else the elevation
                gradient — plus a crisp line tracing the profile edge. */}
            <Path d={paths.area} fill={speedRange ? 'url(#paceFill)' : 'url(#elevFill)'} />
            <Path
              d={paths.line}
              stroke={speedRange ? theme.colors.onSurface : lineColor}
              strokeWidth={2}
              strokeOpacity={speedRange ? 0.5 : 1}
              fill="none"
            />

            {/* Persistent cursor: where a new note will be anchored. */}
            {selectedDistanceM != null && (
              <Line
                x1={xFor(selectedDistanceM)}
                y1={0}
                x2={xFor(selectedDistanceM)}
                y2={CHART_HEIGHT}
                stroke={theme.colors.error}
                strokeWidth={1.5}
                strokeDasharray="3,3"
              />
            )}

            {/* Persistent numbered note pins along the trail. */}
            {markers.map((m, i) => {
              const x = xFor(m.distanceM);
              return (
                <Fragment key={`mk${i}`}>
                  <Line
                    x1={x}
                    y1={16}
                    x2={x}
                    y2={CHART_HEIGHT}
                    stroke={lineColor}
                    strokeWidth={1}
                    opacity={0.25}
                  />
                  <Circle cx={x} cy={10} r={8} fill={lineColor} />
                  <SvgText
                    x={x}
                    y={13.5}
                    fontSize={9}
                    fontWeight="bold"
                    fill="#fff"
                    textAnchor="middle"
                  >
                    {m.label}
                  </SvgText>
                </Fragment>
              );
            })}

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
