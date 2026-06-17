import { parseGpx } from '@core/geo/gpx';
import type { TrackPointAt } from '@core/geo/track';
import type { BoundingBox, TrackPoint } from '@core/models';
import * as storage from '@data/storage';
import { mapColors } from '@ui/theme';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  ImageSource,
  Layer,
  Map,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { useLibraryStore } from '@state/libraryStore';
import { useMapStore } from '@state/mapStore';
import { useRecorderStore } from '@state/recorderStore';
import { useSettingsStore } from '@state/settingsStore';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, FAB, IconButton, Menu, Snackbar, Surface, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompassBadge } from './components/CompassBadge';
import { ElevationProfile } from '../library/components/ElevationProfile';
import { RecordControls } from './components/RecordControls';
import { StatsHud } from './components/StatsHud';
import { toLineFeature, toLngLatBounds } from './geojson';
import { buildOsmStyle } from './mapStyle';
import { useCompass } from './useCompass';
import { useLocationTracking } from './useLocation';
import { usePdfOverlays } from './usePdfOverlay';
import { useTrackOverlays } from './useTrackOverlays';

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);

  const tileUrl = useSettingsStore((s) => s.tileUrl);
  const keepAwake = useSettingsStore((s) => s.keepAwakeWhileRecording);
  const style = useMemo(() => buildOsmStyle(tileUrl), [tileUrl]);

  const { permission } = useLocationTracking();
  const heading = useCompass();

  const maps = useLibraryStore((s) => s.maps);
  const tracks = useLibraryStore((s) => s.tracks);
  const { overlays, error: overlayError } = usePdfOverlays(maps);
  const trackOverlays = useTrackOverlays(tracks);

  const followUser = useMapStore((s) => s.followUser);
  const setFollowUser = useMapStore((s) => s.setFollowUser);
  const showPdfOverlay = useMapStore((s) => s.showPdfOverlay);
  const togglePdfOverlay = useMapStore((s) => s.togglePdfOverlay);
  const showTrackOverlays = useMapStore((s) => s.showTrackOverlays);
  const toggleTrackOverlays = useMapStore((s) => s.toggleTrackOverlays);
  const focusBounds = useMapStore((s) => s.focusBounds);
  const setFocusBounds = useMapStore((s) => s.setFocusBounds);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);

  // Consume a one-shot "fit these bounds" request (e.g. "view trail" from the
  // Library) — fly to the trail instead of staying on the user's location.
  useEffect(() => {
    if (!focusBounds) return;
    setFollowUser(false);
    cameraRef.current?.fitBounds(toLngLatBounds(focusBounds), {
      duration: 600,
      padding: { top: 60, right: 60, bottom: 220, left: 60 },
    });
    setFocusBounds(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBounds]);

  // Trail inspection: tap a trail trace to open its elevation profile; scrubbing
  // the profile drives a marker along the trace (markerAt).
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspectPoints, setInspectPoints] = useState<readonly TrackPoint[] | null>(null);
  const [markerAt, setMarkerAt] = useState<TrackPointAt | null>(null);
  const inspectTrack = tracks.find((t) => t.id === inspectId) ?? null;
  const inspectFileUri = inspectTrack?.fileUri ?? null;

  // Enter/leave inspection; clears any previously-loaded points + marker.
  const inspect = (id: string | null) => {
    setInspectId(id);
    setInspectPoints(null);
    setMarkerAt(null);
  };

  // Load the inspected trail's GPX points once selected.
  useEffect(() => {
    if (!inspectFileUri) return;
    let cancelled = false;
    (async () => {
      try {
        const gpx = await storage.readFileText(inspectFileUri);
        const { points: pts } = parseGpx(gpx);
        if (!cancelled) setInspectPoints(pts);
      } catch {
        if (!cancelled) setInspectPoints(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectFileUri]);

  const status = useRecorderStore((s) => s.status);
  const name = useRecorderStore((s) => s.name);
  const stats = useRecorderStore((s) => s.stats);
  const points = useRecorderStore((s) => s.points);
  const startedAt = useRecorderStore((s) => s.startedAt);
  const start = useRecorderStore((s) => s.start);
  const pause = useRecorderStore((s) => s.pause);
  const resume = useRecorderStore((s) => s.resume);
  const stop = useRecorderStore((s) => s.stop);

  const [elapsedS, setElapsedS] = useState(0);
  const [snack, setSnack] = useState<string | null>(null);

  // Live wall-clock timer, independent of GPS fix cadence.
  useEffect(() => {
    if (status !== 'recording' || startedAt === null) return;
    const tick = () => setElapsedS(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, startedAt]);

  // Keep the screen on while actively recording (if enabled).
  useEffect(() => {
    if (status === 'recording' && keepAwake) {
      void activateKeepAwakeAsync('inukshuk-recording');
      return () => {
        void deactivateKeepAwake('inukshuk-recording');
      };
    }
    return undefined;
  }, [status, keepAwake]);

  const trailFeature = useMemo(() => toLineFeature(points), [points]);

  // Union bounds of all active overlays, for the "fit to page" control.
  const overlaysBbox = useMemo<BoundingBox | null>(() => {
    if (overlays.length === 0) return null;
    return overlays.reduce<BoundingBox | null>(
      (acc, o) =>
        acc === null
          ? o.bbox
          : {
              minLat: Math.min(acc.minLat, o.bbox.minLat),
              minLng: Math.min(acc.minLng, o.bbox.minLng),
              maxLat: Math.max(acc.maxLat, o.bbox.maxLat),
              maxLng: Math.max(acc.maxLng, o.bbox.maxLng),
            },
      null,
    );
  }, [overlays]);

  const fitActiveMap = () => {
    if (overlaysBbox) {
      setFollowUser(false);
      cameraRef.current?.fitBounds(toLngLatBounds(overlaysBbox), {
        duration: 600,
        padding: { top: 48, right: 48, bottom: 48, left: 48 },
      });
    }
  };

  // Tapping the compass snaps the map back to north (bearing 0), keeping the
  // current center and zoom.
  const resetNorth = () => {
    cameraRef.current?.setStop({ bearing: 0, duration: 300 });
  };

  const handleStop = async () => {
    const track = await stop();
    setElapsedS(0);
    setSnack(
      track && track.points.length > 0
        ? `Saved "${track.name}"`
        : 'Recording discarded (no points)',
    );
  };

  return (
    <View style={styles.fill}>
      <Map
        style={styles.fill}
        mapStyle={style}
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ zoom: 14 }}
          trackUserLocation={followUser ? 'default' : undefined}
          onTrackUserLocationChange={(e) => {
            if (e.nativeEvent.trackUserLocation === null) setFollowUser(false);
          }}
          minZoom={1}
          maxZoom={20}
        />

        {showPdfOverlay &&
          overlays.map((o) => (
            <ImageSource key={o.id} id={o.id} url={o.imageUri} coordinates={o.coordinates}>
              <Layer id={`${o.id}-layer`} type="raster" paint={{ 'raster-opacity': 0.92 }} />
            </ImageSource>
          ))}

        {showTrackOverlays &&
          trackOverlays.map((t) => (
            <GeoJSONSource
              key={t.id}
              id={`track-${t.id}`}
              data={t.feature}
              onPress={() => inspect(t.id)}
            >
              <Layer
                id={`track-${t.id}-line`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': inspectId === t.id ? mapColors.userLocation : '#3B6FB0',
                  'line-width': inspectId === t.id ? 6 : 4,
                  'line-opacity': 0.9,
                }}
              />
            </GeoJSONSource>
          ))}

        {markerAt && (
          <GeoJSONSource
            id="inspect-marker"
            data={{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [markerAt.longitude, markerAt.latitude] },
              properties: {},
            }}
          >
            <Layer
              id="inspect-marker-dot"
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

        {trailFeature && (
          <GeoJSONSource id="trail" data={trailFeature}>
            <Layer
              id="trail-glow"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': mapColors.trailGlow, 'line-width': 11 }}
            />
            <Layer
              id="trail-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': mapColors.trail, 'line-width': 5 }}
            />
          </GeoJSONSource>
        )}

        <UserLocation animated accuracy heading />
      </Map>

      {/* Top-left compass */}
      <View style={[styles.topLeft, { top: insets.top + 8 }]} pointerEvents="box-none">
        <CompassBadge heading={heading} onPress={resetNorth} />
      </View>

      {/* Right-side map controls */}
      <View style={[styles.rightControls, { top: insets.top + 8 }]} pointerEvents="box-none">
        <FAB
          icon="crosshairs-gps"
          size="small"
          variant="surface"
          onPress={() => setFollowUser(true)}
          style={styles.controlFab}
        />
        {overlays.length > 0 && (
          <FAB
            icon="fit-to-page-outline"
            size="small"
            variant="surface"
            onPress={fitActiveMap}
            style={styles.controlFab}
          />
        )}
        {(overlays.length > 0 || trackOverlays.length > 0) && (
          <Menu
            visible={overlayMenuOpen}
            onDismiss={() => setOverlayMenuOpen(false)}
            anchor={
              <FAB
                icon="layers"
                size="small"
                variant="surface"
                onPress={() => setOverlayMenuOpen(true)}
                style={styles.controlFab}
                accessibilityLabel="Overlays"
              />
            }
          >
            {/* Layer visibility toggles. Extensible: future overlay types add a row here. */}
            <Menu.Item
              leadingIcon={showPdfOverlay ? 'checkbox-marked' : 'checkbox-blank-outline'}
              onPress={togglePdfOverlay}
              title={`PDF overlays (${overlays.length})`}
            />
            <Menu.Item
              leadingIcon={showTrackOverlays ? 'checkbox-marked' : 'checkbox-blank-outline'}
              onPress={toggleTrackOverlays}
              title={`Trail overlays (${trackOverlays.length})`}
            />
          </Menu>
        )}
      </View>

      {permission === 'denied' && (
        <Banner
          visible
          style={[styles.banner, { top: insets.top + 8 }]}
          icon="map-marker-off"
          actions={[]}
        >
          Location permission denied. Enable it in Settings to see your position and record trails.
        </Banner>
      )}

      {/* Bottom HUD + controls */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        {status !== 'idle' && (
          <StatsHud name={name} stats={stats} elapsedS={elapsedS} paused={status === 'paused'} />
        )}
        <View style={styles.controlsRow} pointerEvents="box-none">
          <RecordControls
            status={status}
            onStart={() => start()}
            onPause={pause}
            onResume={resume}
            onStop={handleStop}
          />
        </View>
      </View>

      {inspectId && inspectPoints && inspectTrack && (
        <Surface style={[styles.inspectPanel, { paddingBottom: insets.bottom + 8 }]} elevation={4}>
          <View style={styles.inspectHeader}>
            <Text variant="titleSmall" numberOfLines={1} style={styles.inspectTitle}>
              {inspectTrack.name}
            </Text>
            <IconButton
              icon="close"
              size={20}
              onPress={() => inspect(null)}
              accessibilityLabel="Close trail inspector"
            />
          </View>
          <ElevationProfile
            points={inspectPoints}
            ascentM={inspectTrack.stats.ascentM}
            descentM={inspectTrack.stats.descentM}
            onScrub={setMarkerAt}
          />
        </Surface>
      )}

      <Snackbar visible={snack !== null} onDismiss={() => setSnack(null)} duration={3000}>
        {snack ?? ''}
      </Snackbar>
      {overlayError && (
        <Snackbar visible onDismiss={() => undefined} duration={4000}>
          {`Map overlay: ${overlayError}`}
        </Snackbar>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topLeft: { position: 'absolute', left: 12 },
  rightControls: { position: 'absolute', right: 12, gap: 10, alignItems: 'flex-end' },
  controlFab: { borderRadius: 24 },
  banner: { position: 'absolute', left: 8, right: 8, borderRadius: 12 },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 0, gap: 14 },
  controlsRow: { alignItems: 'center' },
  inspectPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 4,
  },
  inspectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
  },
  inspectTitle: { flexShrink: 1, fontWeight: '700' },
});
