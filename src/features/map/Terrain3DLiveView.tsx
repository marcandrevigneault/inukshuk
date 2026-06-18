import { padBbox } from '@core/geo/terrain';
import type { LatLng } from '@core/models';
import type { MapBasemap } from '@state/mapStore';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Text, useTheme } from 'react-native-paper';
import * as THREE from 'three';
import { fetchBasemapTexture, fetchHeightmap } from './dem';
import { buildTerrain } from './terrainScene';

interface Props {
  /** Live device location; the surface is built around it and a marker tracks it. */
  center: LatLng | null;
  /** Active base layer (drapes OSM/satellite tiles, or hypsometric relief). */
  basemap: MapBasemap;
  /** Whether foreground location permission was granted. */
  permission: 'undetermined' | 'granted' | 'denied';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// Half-extent (metres) of terrain built around the anchor — ~4 km of context.
const BOX_M = 4000;

/**
 * M1 of the real-3D main map: a static "3D around me" surface. Builds a real,
 * extruded terrain mesh (expo-gl + Three.js) for a fixed box around the device's
 * location, draped with the active basemap, with a live position marker and
 * orbit/pinch gestures. Tap recenter to rebuild at the current location. Tile
 * streaming as you pan is a later milestone; this fetches one box per anchor.
 */
export function Terrain3DLiveView({ center, basemap, permission }: Props) {
  const theme = useTheme();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [recenter, setRecenter] = useState(0);

  // Latest location, read by the render loop (live marker) and at build time
  // (anchor). Updated in an effect so we never mutate a ref during render.
  const locRef = useRef<LatLng | null>(center);
  useEffect(() => {
    locRef.current = center;
  }, [center]);

  const orbit = useRef({ theta: 0.6, phi: 0.85, radius: 4, center: new THREE.Vector3() });
  const gest = useRef({ x: 0, y: 0, cx: 0, cy: 0, dist: 0, single: true });
  const projectRef = useRef<((lng: number, lat: number) => THREE.Vector3) | null>(null);
  const bboxRef = useRef<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(
    null,
  );

  const pan = useMemo(
    () =>
      // Refs are read on touch events only, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (_e, g) => {
          gest.current = { x: g.x0, y: g.y0, cx: 0, cy: 0, dist: 0, single: true };
        },
        onPanResponderMove: (e, g) => {
          const t = e.nativeEvent.touches;
          const o = orbit.current;
          const gp = gest.current;
          if (t.length >= 2 && t[0] && t[1]) {
            const dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
            const cx = (t[0].pageX + t[1].pageX) / 2;
            const cy = (t[0].pageY + t[1].pageY) / 2;
            if (gp.dist > 0) {
              o.radius = clamp(o.radius * (gp.dist / dist), 0.8, 9);
              o.theta -= (cx - gp.cx) * 0.006;
              o.phi = clamp(o.phi - (cy - gp.cy) * 0.006, 0.12, 1.45);
            }
            gp.dist = dist;
            gp.cx = cx;
            gp.cy = cy;
            gp.single = false;
          } else {
            if (gp.single) {
              o.theta -= (g.moveX - gp.x) * 0.008;
              o.phi = clamp(o.phi - (g.moveY - gp.y) * 0.006, 0.12, 1.45);
            }
            gp.x = g.moveX;
            gp.y = g.moveY;
            gp.single = true;
            gp.dist = 0;
          }
        },
      }),
    [],
  );

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    const anchor = locRef.current;
    if (!anchor) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const bbox = padBbox(
        {
          minLat: anchor.latitude,
          maxLat: anchor.latitude,
          minLng: anchor.longitude,
          maxLng: anchor.longitude,
        },
        0,
        BOX_M,
      );
      const hm = await fetchHeightmap(bbox);
      bboxRef.current = hm.bbox;
      let texture;
      if (basemap !== 'relief') {
        try {
          texture = await fetchBasemapTexture(hm.range, basemap);
        } catch {
          texture = undefined; // fall back to hypsometric relief
        }
      }
      const { group, center: gc, radius, project } = buildTerrain(hm, [], texture);
      projectRef.current = project;

      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      const SKY = 0xcfe0ec;
      renderer.setClearColor(SKY, 1);
      const scene = new THREE.Scene();
      // Fade the terrain into the sky at distance so its edges never read as a
      // floating slab — the mesh appears to extend to a hazy horizon, filling view.
      scene.fog = new THREE.Fog(SKY, radius * 0.7, radius * 2.0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1);
      sun.position.set(1.5, 2.5, 1);
      scene.add(sun);
      scene.add(group);

      // Live "you are here" marker: a coloured head on a pole, set on the surface.
      const marker = new THREE.Group();
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x566b33, emissive: 0x1a240a }),
      );
      head.position.y = 0.13;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.13, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 }),
      );
      pole.position.y = 0.065;
      marker.add(head, pole);
      scene.add(marker);

      const camera = new THREE.PerspectiveCamera(
        55,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.01,
        100,
      );
      orbit.current.center = gc;
      // Closer + lower angle so terrain fills the frame down to a fogged horizon.
      orbit.current.radius = clamp(radius * 1.25, 0.8, 9);
      orbit.current.phi = 1.12;
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
        // Keep the marker on the live position when it falls inside the built box.
        const loc = locRef.current;
        const b = bboxRef.current;
        if (loc && b && projectRef.current) {
          const inside =
            loc.latitude >= b.minLat &&
            loc.latitude <= b.maxLat &&
            loc.longitude >= b.minLng &&
            loc.longitude <= b.maxLng;
          marker.visible = inside;
          if (inside) marker.position.copy(projectRef.current(loc.longitude, loc.latitude));
        } else {
          marker.visible = false;
        }
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      render();
    } catch {
      setStatus('error');
    }
  };

  if (permission === 'denied') {
    return (
      <View style={[styles.fill, styles.centerBox]}>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          Location permission is needed to show 3D terrain around you.
        </Text>
      </View>
    );
  }
  if (!center) {
    return (
      <View style={[styles.fill, styles.centerBox]}>
        <ActivityIndicator />
        <Text style={[styles.waitText, { color: theme.colors.onSurfaceVariant }]}>
          Waiting for your location…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <GLView
        // Remounting rebuilds the scene: on basemap change or an explicit recenter.
        key={`${basemap}:${recenter}`}
        style={styles.fill}
        onContextCreate={onContextCreate}
        {...pan.panHandlers}
      />
      {status === 'loading' && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Couldn’t load 3D terrain.</Text>
        </View>
      )}
      <IconButton
        icon="crosshairs-gps"
        mode="contained"
        size={22}
        onPress={() => setRecenter((n) => n + 1)}
        style={styles.recenter}
        accessibilityLabel="Recenter 3D terrain on me"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  waitText: { marginTop: 4 },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenter: { position: 'absolute', left: 12, bottom: 96 },
});
