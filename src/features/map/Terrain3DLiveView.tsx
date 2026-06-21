import { padBbox } from '@core/geo/terrain';
import type { BoundingBox, LatLng, LngLat, TrackPoint } from '@core/models';
import type { MapBasemap } from '@state/mapStore';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Text, useTheme } from 'react-native-paper';
import * as THREE from 'three';
import { fetchBasemapTexture, fetchHeightmap } from './dem';
import { buildTerrain, type TerrainBuild } from './terrainScene';

interface Props {
  /** Live device location; the surface is built around it and a marker tracks it. */
  center: LatLng | null;
  /** Active base layer (drapes OSM/satellite tiles, or hypsometric relief). */
  basemap: MapBasemap;
  /** Whether foreground location permission was granted. */
  permission: 'undetermined' | 'granted' | 'denied';
  /** Active saved-trail polylines to drape on the terrain (lng/lat). */
  trails: readonly (readonly LngLat[])[];
  /** Live recording trace points (empty when not recording). */
  recordPoints: readonly TrackPoint[];
  /** Live dropped waypoints to pin on the terrain. */
  waypoints: readonly { latitude: number; longitude: number }[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// Half-extent (metres) of terrain built around the anchor — ~4 km of context.
const BOX_M = 4000;
// Re-anchor (rebuild around the new position) once the user drifts this far from
// the current box centre, so terrain always extends well ahead of them.
const REANCHOR_M = 700;

const pointBox = (c: LatLng): BoundingBox => ({
  minLat: c.latitude,
  maxLat: c.latitude,
  minLng: c.longitude,
  maxLng: c.longitude,
});

/** Rough planar metres between two coords — fine for the re-anchor threshold. */
function metresBetween(a: LatLng, b: LatLng): number {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  return Math.hypot(
    (a.latitude - b.latitude) * mPerDegLat,
    (a.longitude - b.longitude) * mPerDegLng,
  );
}

interface Built extends TerrainBuild {
  bbox: BoundingBox;
}

/** Fetch the DEM + basemap for a box around `anchor` and build a terrain group. */
async function fetchAndBuild(anchor: LatLng, basemap: MapBasemap): Promise<Built> {
  const hm = await fetchHeightmap(padBbox(pointBox(anchor), 0, BOX_M));
  let texture;
  if (basemap !== 'relief') {
    try {
      texture = await fetchBasemapTexture(hm.range, basemap);
    } catch {
      texture = undefined; // fall back to hypsometric relief
    }
  }
  return { ...buildTerrain(hm, [], texture), bbox: hm.bbox };
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.MeshStandardMaterial | undefined;
    if (mat) {
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

type Project = (lng: number, lat: number) => THREE.Vector3;
const inBox = (b: BoundingBox, lng: number, lat: number) =>
  lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;

/**
 * Add a draped polyline (a trail or recording trace) as tube segments, split at
 * the box edges so points outside the loaded terrain don't snap to the border.
 */
function addPolyline(
  group: THREE.Group,
  coords: readonly LngLat[],
  project: Project,
  bbox: BoundingBox,
  color: number,
  radius: number,
): void {
  let run: THREE.Vector3[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const tube = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(run),
        Math.min(900, run.length * 6),
        radius,
        6,
        false,
      );
      // Unlit so the route reads as a crisp, consistently bright line on the
      // terrain (like a drawn track) rather than a dull shaded tube.
      group.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color })));
    }
    run = [];
  };
  for (const [lng, lat] of coords) {
    if (inBox(bbox, lng, lat)) {
      // Lift a hair above the surface so the fine line drapes on top, not buried.
      const v = project(lng, lat);
      v.y += 0.006;
      run.push(v);
    } else flush();
  }
  flush();
}

/**
 * A clean map-pin marker: a charcoal teardrop (round head + tapered point that
 * touches the surface) with a white dot on the face — reads clearly as a pin from
 * any orbit angle, instead of a sphere floating on a stick.
 */
function waypointPin(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: 0x2d3740,
    emissive: 0x0a0f14,
    roughness: 0.5,
  });
  // Tapered point (cone tip down) from the surface up to the head.
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 18), body);
  cone.rotation.x = Math.PI; // tip points down
  cone.position.y = 0.065; // tip ~0.015 above surface, base ~0.115
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.034, 18, 18), body);
  head.position.y = 0.13;
  // White face dot for the classic pin look.
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.013, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  dot.position.set(0, 0.13, 0.027);
  g.add(cone, head, dot);
  return g;
}

const TRAIL_COLOR = 0xe0312b; // saved trails — fine red drape line
const REC_COLOR = 0xd76b27; // live recording trace — warm orange

/**
 * Real 3D on the main map. Builds an extruded terrain mesh (expo-gl + Three.js)
 * for a box around the device's location, draped with the active basemap (or
 * hypsometric relief), with a live "you are here" marker and orbit/pinch
 * gestures. In follow mode the camera tracks the user (M2) and the terrain box
 * re-anchors around them as they move (M3) — fetching only new tiles, since the
 * tile cache serves the overlap. Tap the locate button to toggle follow.
 */
export function Terrain3DLiveView({
  center,
  basemap,
  permission,
  trails,
  recordPoints,
  waypoints,
}: Props) {
  const theme = useTheme();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [follow, setFollow] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [recenter, setRecenter] = useState(0);

  // Latest props read by the render loop / async re-anchor, never during render.
  const locRef = useRef<LatLng | null>(center);
  const followRef = useRef(follow);
  const basemapRef = useRef(basemap);
  useEffect(() => {
    locRef.current = center;
  }, [center]);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);
  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);

  const orbit = useRef({ theta: 0.6, phi: 1.12, radius: 4, center: new THREE.Vector3() });
  const gest = useRef({ x: 0, y: 0, cx: 0, cy: 0, dist: 0, single: true });
  const projectRef = useRef<((lng: number, lat: number) => THREE.Vector3) | null>(null);
  const bboxRef = useRef<BoundingBox | null>(null);
  const anchorRef = useRef<LatLng | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const reanchoringRef = useRef(false);
  const overlaysRef = useRef<THREE.Group | null>(null);
  const trailsRef = useRef(trails);
  const recordPointsRef = useRef(recordPoints);
  const waypointsRef = useRef(waypoints);

  // Rebuild the draped overlays (saved trails, live trace, waypoint pins) against
  // the current projection. Called on first build, on re-anchor (the projection
  // changes), and whenever the overlay data changes. Reads refs, so it stays
  // current without being recreated.
  const rebuildOverlays = () => {
    const scene = sceneRef.current;
    const project = projectRef.current;
    const bbox = bboxRef.current;
    if (!scene || !project || !bbox) return;
    const old = overlaysRef.current;
    if (old) {
      scene.remove(old);
      disposeGroup(old);
    }
    const g = new THREE.Group();
    for (const coords of trailsRef.current)
      addPolyline(g, coords, project, bbox, TRAIL_COLOR, 0.0042);
    const rec = recordPointsRef.current;
    if (rec.length >= 2) {
      addPolyline(
        g,
        rec.map((p) => [p.longitude, p.latitude] as LngLat),
        project,
        bbox,
        REC_COLOR,
        0.011,
      );
    }
    for (const w of waypointsRef.current) {
      if (!inBox(bbox, w.longitude, w.latitude)) continue;
      const pin = waypointPin();
      pin.position.copy(project(w.longitude, w.latitude));
      g.add(pin);
    }
    scene.add(g);
    overlaysRef.current = g;
  };

  // Keep the data refs fresh and re-drape whenever overlays change.
  useEffect(() => {
    trailsRef.current = trails;
    recordPointsRef.current = recordPoints;
    waypointsRef.current = waypoints;
    rebuildOverlays(); // reads refs; a no-op until the scene exists
  }, [trails, recordPoints, waypoints]);

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
      const {
        group,
        center: gc,
        radius,
        project,
        bbox,
      } = await fetchAndBuild(anchor, basemapRef.current);
      projectRef.current = project;
      bboxRef.current = bbox;
      anchorRef.current = anchor;

      const renderer = new Renderer({ gl });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      const SKY = 0xcfe0ec;
      renderer.setClearColor(SKY, 1);
      const scene = new THREE.Scene();
      sceneRef.current = scene;
      // Fade the terrain into the sky at distance so its edges never read as a
      // floating slab — the mesh appears to extend to a hazy horizon, filling view.
      scene.fog = new THREE.Fog(SKY, radius * 0.7, radius * 2.0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 0.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1);
      sun.position.set(1.5, 2.5, 1);
      scene.add(sun);
      scene.add(group);
      groupRef.current = group;

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
      rebuildOverlays(); // drape trails / recording / waypoints on the surface

      const camera = new THREE.PerspectiveCamera(
        55,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.01,
        100,
      );
      // Closer + lower angle so terrain fills the frame down to a fogged horizon.
      orbit.current.center = gc;
      orbit.current.radius = clamp(radius * 1.25, 0.8, 9);
      setStatus('ready');

      const target = new THREE.Vector3();
      const render = () => {
        requestAnimationFrame(render);
        const o = orbit.current;
        // Project the live position onto the (possibly re-anchored) surface.
        const loc = locRef.current;
        const b = bboxRef.current;
        const inside =
          !!loc &&
          !!b &&
          loc.latitude >= b.minLat &&
          loc.latitude <= b.maxLat &&
          loc.longitude >= b.minLng &&
          loc.longitude <= b.maxLng;
        if (inside && projectRef.current && loc) {
          target.copy(projectRef.current(loc.longitude, loc.latitude));
          marker.position.copy(target);
          marker.visible = true;
          // Follow mode: keep the camera centred on the moving user.
          if (followRef.current) o.center.copy(target);
        } else {
          marker.visible = false;
        }
        const c = o.center;
        camera.position.set(
          c.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta),
          c.y + o.radius * Math.cos(o.phi),
          c.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta),
        );
        camera.lookAt(c);
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      render();
    } catch {
      setStatus('error');
    }
  };

  // M3: when following and the user has drifted far from the current box centre,
  // rebuild the terrain around their new position and swap it in (no GL remount).
  useEffect(() => {
    if (!follow || !center) return;
    const anchor = anchorRef.current;
    const scene = sceneRef.current;
    if (!anchor || !scene || reanchoringRef.current) return;
    if (metresBetween(anchor, center) < REANCHOR_M) return;
    reanchoringRef.current = true;
    setStreaming(true);
    let cancelled = false;
    (async () => {
      try {
        const built = await fetchAndBuild(center, basemapRef.current);
        if (cancelled) {
          disposeGroup(built.group);
          return;
        }
        const old = groupRef.current;
        scene.add(built.group);
        if (old) {
          scene.remove(old);
          disposeGroup(old);
        }
        groupRef.current = built.group;
        projectRef.current = built.project;
        bboxRef.current = built.bbox;
        anchorRef.current = center;
        rebuildOverlays(); // re-drape against the new projection
      } catch {
        /* keep the existing terrain on failure */
      } finally {
        reanchoringRef.current = false;
        if (!cancelled) setStreaming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [center, follow]);

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
        // Remounting fully rebuilds the scene: on basemap change or manual recenter.
        key={`${basemap}:${recenter}`}
        style={styles.fill}
        onContextCreate={onContextCreate}
        {...pan.panHandlers}
      />
      {(status === 'loading' || streaming) && (
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
        iconColor={follow ? theme.colors.onPrimary : theme.colors.onSurface}
        containerColor={follow ? theme.colors.primary : theme.colors.surface}
        onPress={() => {
          // Retry a failed load; otherwise toggle follow (camera tracks you and
          // the terrain re-anchors as you move).
          if (status === 'error') setRecenter((n) => n + 1);
          else setFollow((f) => !f);
        }}
        style={styles.recenter}
        accessibilityLabel={follow ? 'Stop following my location' : 'Follow my location in 3D'}
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
