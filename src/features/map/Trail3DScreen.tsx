import { parseGpx } from '@core/geo/gpx';
import type { TrackPointAt } from '@core/geo/track';
import type { TrackPoint } from '@core/models';
import * as storage from '@data/storage';
import { Camera, type CameraRef, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { formatDistance, formatDuration, formatElevation, formatPace } from '@lib/format';
import { useLibraryStore } from '@state/libraryStore';
import { useSettingsStore } from '@state/settingsStore';
import { mapColors } from '@ui/theme';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Surface, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ElevationProfile } from '../library/components/ElevationProfile';
import { toLineFeature, toLngLatBounds } from './geojson';
import { buildOsmStyle } from './mapStyle';

interface Props {
  trackId: string;
}

/**
 * A trail in 3D: the relief-terrain camera is flown to the trail bounds and
 * pitched, the trace is drawn on the terrain, a summary card floats on top, and
 * the elevation profile docks below — scrubbing it slides a marker along the
 * trace.
 */
export function Trail3DScreen({ trackId }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const track = useLibraryStore((s) => s.tracks.find((t) => t.id === trackId));
  const tileUrl = useSettingsStore((s) => s.tileUrl);
  const style = useMemo(() => buildOsmStyle(tileUrl, true), [tileUrl]);

  const cameraRef = useRef<CameraRef>(null);
  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [marker, setMarker] = useState<TrackPointAt | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const fileUri = track?.fileUri;
  useEffect(() => {
    let alive = true;
    if (!fileUri) return;
    void (async () => {
      try {
        const gpx = await storage.readFileText(fileUri);
        if (alive) setPoints(parseGpx(gpx).points);
      } catch {
        if (alive) setPoints([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fileUri]);

  const feature = useMemo(() => (points ? toLineFeature(points) : null), [points]);
  const bbox = track?.stats.bbox;

  // Once the map is ready, frame the trail then pitch into 3D.
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam || !mapLoaded || !bbox) return;
    cam.fitBounds(toLngLatBounds(bbox), {
      duration: 600,
      padding: { top: 160, right: 50, bottom: 320, left: 50 },
    });
    const t = setTimeout(() => cam.setStop({ pitch: 58, duration: 700 }), 700);
    return () => clearTimeout(t);
  }, [mapLoaded, bbox]);

  if (!track) {
    return (
      <View style={styles.fill}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Trail" />
        </Appbar.Header>
        <Text style={styles.pad}>This trail is no longer available.</Text>
      </View>
    );
  }

  const s = track.stats;

  return (
    <View style={styles.fill}>
      <Map
        style={styles.fill}
        mapStyle={style}
        attribution
        attributionPosition={{ bottom: 4, left: 4 }}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
      >
        <Camera ref={cameraRef} minZoom={1} maxZoom={20} />
        {feature && (
          <GeoJSONSource id="trail3d" data={feature}>
            <Layer
              id="trail3d-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': mapColors.userLocation,
                'line-width': 5,
                'line-opacity': 0.95,
              }}
            />
          </GeoJSONSource>
        )}
        {marker && (
          <GeoJSONSource
            id="trail3d-marker"
            data={{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [marker.longitude, marker.latitude] },
              properties: {},
            }}
          >
            <Layer
              id="trail3d-marker-dot"
              type="circle"
              paint={{
                'circle-radius': 7,
                'circle-color': mapColors.userLocation,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
            />
          </GeoJSONSource>
        )}
      </Map>

      <Appbar.BackAction
        onPress={() => router.back()}
        style={[styles.back, { top: insets.top + 4 }]}
      />

      <Surface style={[styles.summary, { top: insets.top + 4 }]} elevation={3}>
        <Text variant="titleSmall" numberOfLines={1}>
          {track.name}
        </Text>
        <View style={styles.summaryRow}>
          <Text variant="labelMedium">{formatDistance(s.distanceM)}</Text>
          <Text variant="labelMedium">↑ {formatElevation(s.ascentM)}</Text>
          <Text variant="labelMedium">↓ {formatElevation(s.descentM)}</Text>
          <Text variant="labelMedium">{formatDuration(s.durationS)}</Text>
          <Text variant="labelMedium">{formatPace(s.avgSpeedMps)}</Text>
        </View>
      </Surface>

      {points && points.length > 0 && (
        <Surface style={[styles.profile, { paddingBottom: insets.bottom }]} elevation={4}>
          <ElevationProfile
            points={points}
            ascentM={s.ascentM}
            descentM={s.descentM}
            onScrub={setMarker}
          />
        </Surface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 16 },
  back: { position: 'absolute', left: 4, margin: 0 },
  summary: {
    position: 'absolute',
    left: 60,
    right: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  profile: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});
