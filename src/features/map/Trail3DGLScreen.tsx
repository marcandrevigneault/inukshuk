import { parseGpx } from '@core/geo/gpx';
import type { TrackPoint } from '@core/models';
import * as storage from '@data/storage';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { formatDistance, formatDuration, formatElevation, formatPace } from '@lib/format';
import { useLibraryStore } from '@state/libraryStore';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Surface, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';
import { fetchHeightmap } from './dem';
import { buildTerrain } from './terrainScene';
import { ElevationProfile } from '../library/components/ElevationProfile';

interface Props {
  trackId: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Real 3D trail view: a Three.js terrain mesh built from free Terrarium DEM
 * tiles (drawn in an expo-gl GLView), with the GPX trace draped on the surface.
 * One finger orbits, two fingers pinch to zoom; the elevation profile docks below.
 */
export function Trail3DGLScreen({ trackId }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const track = useLibraryStore((s) => s.tracks.find((t) => t.id === trackId));

  const [points, setPoints] = useState<TrackPoint[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  // Camera orbit + gesture bookkeeping (mutated outside React, read each frame).
  const orbit = useRef({ theta: 0.6, phi: 0.85, radius: 4, center: new THREE.Vector3() });
  const gesture = useRef({ x: 0, y: 0, pinch: 0 });

  const pan = useMemo(
    () =>
      // The handlers read orbit/gesture refs only on touch events, never during
      // render — safe, but react-hooks/refs can't see that.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_e, g) => {
          gesture.current = { x: g.x0, y: g.y0, pinch: 0 };
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2 && touches[0] && touches[1]) {
            const d = Math.hypot(
              touches[0].pageX - touches[1].pageX,
              touches[0].pageY - touches[1].pageY,
            );
            if (gesture.current.pinch > 0) {
              orbit.current.radius = clamp(
                orbit.current.radius * (gesture.current.pinch / d),
                0.9,
                9,
              );
            }
            gesture.current.pinch = d;
          } else {
            gesture.current.pinch = 0;
            orbit.current.theta -= (g.moveX - gesture.current.x) * 0.008;
            orbit.current.phi = clamp(
              orbit.current.phi - (g.moveY - gesture.current.y) * 0.006,
              0.12,
              1.45,
            );
          }
          gesture.current.x = g.moveX;
          gesture.current.y = g.moveY;
        },
      }),
    [],
  );

  const fileUri = track?.fileUri;
  const bbox = track?.stats.bbox;

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    try {
      const gpx = fileUri ? await storage.readFileText(fileUri) : '';
      const pts = gpx ? parseGpx(gpx).points : [];
      setPoints(pts);
      if (!bbox) {
        setStatus('error');
        return;
      }
      const hm = await fetchHeightmap(bbox);
      const { group, center, radius } = buildTerrain(hm, pts);

      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0xcfe0ec, 1);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1);
      sun.position.set(1.5, 2.5, 1);
      scene.add(sun);
      scene.add(group);

      const camera = new THREE.PerspectiveCamera(
        55,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.01,
        100,
      );
      orbit.current.center = center;
      orbit.current.radius = radius * 2.1;
      setStatus('ready');

      const render = () => {
        requestAnimationFrame(render);
        const { theta, phi, radius: r, center: c } = orbit.current;
        camera.position.set(
          c.x + r * Math.sin(phi) * Math.sin(theta),
          c.y + r * Math.cos(phi),
          c.z + r * Math.sin(phi) * Math.cos(theta),
        );
        camera.lookAt(c);
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      render();
    } catch (e) {
      setErrMsg(e instanceof Error ? `${e.message}` : String(e));
      setStatus('error');
    }
  };

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
      <GLView style={styles.fill} onContextCreate={onContextCreate} {...pan.panHandlers} />

      {status === 'loading' && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Building 3D terrain…</Text>
        </View>
      )}
      {status === 'error' && (
        <View style={styles.center} pointerEvents="none">
          <Text>Couldn&apos;t load 3D terrain.</Text>
          {errMsg ? (
            <Text variant="bodySmall" style={styles.errDetail}>
              {errMsg}
            </Text>
          ) : null}
        </View>
      )}

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
          <ElevationProfile points={points} ascentM={s.ascentM} descentM={s.descentM} />
        </Surface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: 16 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: { opacity: 0.8 },
  errDetail: { opacity: 0.7, paddingHorizontal: 24, textAlign: 'center' },
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
