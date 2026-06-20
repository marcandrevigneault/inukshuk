# GPX viewing & import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve GPX waypoints as trail notes, add a 2D/3D toggle to the trail view, and let users open a `.gpx` file directly with Inukshuk.

**Architecture:** All parsing/snapping stays pure in `src/core` (unit-tested); the Zustand stores and `src/features` screens consume it. Phase 1 lands note _data_ (visible immediately in the elevation profile + notes list); Phase 2 renders note pins in a new 2D trail view and the existing 3D view behind a remembered toggle; Phase 3 adds native file association plus a root hook that imports an opened file.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, TypeScript (strict + noUncheckedIndexedAccess), Zustand, MapLibre RN, expo-gl + three, expo-linking, fast-xml-parser, Jest.

## Global Constraints

- `src/core/**` stays pure — no `react-native`/`expo` imports; new core logic gets co-located `*.test.ts`.
- Path aliases: `@core`, `@data`, `@state`, `@features`, `@ui`, `@lib`, `@/`.
- Strict TS: index access is `T | undefined` — guard, don't cast.
- `npm run check` (typecheck + lint with **zero** warnings + prettier single-quote/semicolon/width-100 + tests) must pass before each commit that ends a task.
- Versioning for the shipping build: versionName `1.0.0`, **versionCode 42** (monotonic; 41 already uploaded).
- File association is **GPX-only** (never PDF).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Phase 1 — waypoints → notes (pure data)**

- Modify `src/core/geo/gpx/index.ts` — add `GpxWaypoint`, `GpxDocument.waypoints`, `GpxDocument.hasTrackOrRoutePoints`.
- Create `src/core/geo/track/snapWaypoints.ts` — `ImportedNote`, `snapWaypointsToNotes()`.
- Modify `src/core/geo/track/index.ts` — re-export the above.
- Modify `src/features/library/importGpx.ts` — parse waypoints, return `notes`.
- Modify `src/state/libraryStore.ts` — `addTrack(track, fileUri, notes?)`.
- Modify `src/features/library/LibraryScreen.tsx` — pass `notes` to `addTrack`.

**Phase 2 — 2D/3D toggle**

- Modify `src/state/settingsStore.ts` — `trailViewMode: '2d' | '3d'`.
- Create `src/features/map/Trail2DView.tsx` — MapLibre trail + note pins.
- Modify `src/features/map/Trail3DGLScreen.tsx` — toggle + branch + 3D note pins.

**Phase 3 — open a `.gpx`**

- Modify `app.config.ts` — `android.intentFilters` + `ios.infoPlist` doc type.
- Create `src/core/share/incomingFile.ts` — `classifyIncomingUri()`.
- Modify `src/data/storage.ts` — `readTextFromUri()`, `writeGpxText()`.
- Modify `src/features/library/importGpx.ts` — `importGpxFromUri()`.
- Create `src/state/importFeedbackStore.ts` — root snackbar message.
- Create `src/features/share/useIncomingFile.ts` — the open-handler hook.
- Create `src/features/share/ImportFeedbackSnackbar.tsx` — root snackbar.
- Modify `app/_layout.tsx` — mount hook + snackbar.

---

# PHASE 1 — GPX waypoints become trail notes

### Task 1: Parse `<wpt>` waypoints in `parseGpx`

**Files:**

- Modify: `src/core/geo/gpx/index.ts`
- Test: `src/core/geo/gpx/index.test.ts` (add cases to the existing file)

**Interfaces:**

- Produces:

  ```ts
  export interface GpxWaypoint {
    latitude: number;
    longitude: number;
    name?: string;
    description?: string;
    symbol?: string;
    time?: number; // epoch ms
  }
  // GpxDocument gains:
  //   waypoints: GpxWaypoint[];
  //   hasTrackOrRoutePoints: boolean;
  ```

- [ ] **Step 1: Write the failing test**

Add to `src/core/geo/gpx/index.test.ts`:

```ts
describe('parseGpx waypoints', () => {
  it('extracts <wpt> name/desc/sym separately from track points', () => {
    const xml = `<?xml version="1.0"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="46.81" lon="-71.21"><name>Lookout</name><desc>great view</desc><sym>Summit</sym></wpt>
        <trk><trkseg>
          <trkpt lat="46.80" lon="-71.20"></trkpt>
          <trkpt lat="46.82" lon="-71.22"></trkpt>
        </trkseg></trk>
      </gpx>`;
    const doc = parseGpx(xml);
    expect(doc.points).toHaveLength(2);
    expect(doc.hasTrackOrRoutePoints).toBe(true);
    expect(doc.waypoints).toEqual([
      {
        latitude: 46.81,
        longitude: -71.21,
        name: 'Lookout',
        description: 'great view',
        symbol: 'Summit',
      },
    ]);
  });

  it('reports hasTrackOrRoutePoints=false for a waypoint-only file', () => {
    const xml = `<?xml version="1.0"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="46.81" lon="-71.21"><name>Car</name></wpt>
      </gpx>`;
    const doc = parseGpx(xml);
    expect(doc.hasTrackOrRoutePoints).toBe(false);
    expect(doc.waypoints).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/geo/gpx/index.test.ts -t waypoints`
Expected: FAIL (`waypoints`/`hasTrackOrRoutePoints` undefined).

- [ ] **Step 3: Implement**

In `src/core/geo/gpx/index.ts`:

Add the interface after `GpxMetadata` (around line 16):

```ts
export interface GpxWaypoint {
  latitude: number;
  longitude: number;
  name?: string;
  description?: string;
  symbol?: string;
  /** Epoch milliseconds of the waypoint's <time>, if present. */
  time?: number;
}
```

Extend `GpxDocument` (around line 18):

```ts
export interface GpxDocument {
  metadata: GpxMetadata;
  /** All track/route/waypoint points, flattened in document order. */
  points: TrackPoint[];
  /** Standalone <wpt> markers, preserved with their labels. */
  waypoints: GpxWaypoint[];
  /** True when `points` came from <trk>/<rte> (not the <wpt> fallback). */
  hasTrackOrRoutePoints: boolean;
}
```

Add a waypoint parser after `parsePoint` (around line 131):

```ts
const parseWaypoint = (raw: AnyRecord): GpxWaypoint | undefined => {
  const lat = toNum(raw[`${ATTR_PREFIX}lat`]);
  const lon = toNum(raw[`${ATTR_PREFIX}lon`]);
  if (lat === undefined || lon === undefined) return undefined;
  const wpt: GpxWaypoint = { latitude: lat, longitude: lon };
  const name = textOf(raw['name']);
  if (name !== undefined) wpt.name = name;
  const desc = textOf(raw['desc']) ?? textOf(raw['description']);
  if (desc !== undefined) wpt.description = desc;
  const sym = textOf(raw['sym']);
  if (sym !== undefined) wpt.symbol = sym;
  const time = isoToEpochMs(textOf(raw['time']));
  if (time !== undefined) wpt.time = time;
  return wpt;
};
```

In `parseGpx`, replace the `const points: TrackPoint[] = [];` block and the two
fallbacks (lines 173-200) with:

```ts
const points: TrackPoint[] = [];

for (const trk of asArray<AnyRecord>(gpx['trk'])) {
  for (const seg of asArray<AnyRecord>(trk['trkseg'])) {
    for (const pt of asArray<AnyRecord>(seg['trkpt'])) {
      const parsedPt = parsePoint(pt);
      if (parsedPt) points.push(parsedPt);
    }
  }
}
for (const rte of asArray<AnyRecord>(gpx['rte'])) {
  if (points.length > 0) break;
  for (const pt of asArray<AnyRecord>(rte['rtept'])) {
    const parsedPt = parsePoint(pt);
    if (parsedPt) points.push(parsedPt);
  }
}
const hasTrackOrRoutePoints = points.length > 0;

// Always preserve <wpt> markers with their labels.
const waypoints: GpxWaypoint[] = [];
for (const pt of asArray<AnyRecord>(gpx['wpt'])) {
  const w = parseWaypoint(pt);
  if (w) waypoints.push(w);
}

// Back-compat: a waypoint-only file still yields a "track" from its points.
if (points.length === 0) {
  for (const w of waypoints)
    points.push({ latitude: w.latitude, longitude: w.longitude, time: w.time ?? 0 });
}

return { metadata, points, waypoints, hasTrackOrRoutePoints };
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/core/geo/gpx/index.test.ts`
Expected: PASS (new + existing GPX tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/geo/gpx/index.ts src/core/geo/gpx/index.test.ts
git commit -m "feat(gpx): preserve <wpt> waypoints in parseGpx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Snap waypoints to distance-anchored notes

**Files:**

- Create: `src/core/geo/track/snapWaypoints.ts`
- Test: `src/core/geo/track/snapWaypoints.test.ts`
- Modify: `src/core/geo/track/index.ts` (re-export)

**Interfaces:**

- Consumes: `GpxWaypoint` from `@core/geo/gpx`; `haversineMeters` from `@core/geo/geomath`; `TrackPoint` from `@core/models`.
- Produces:

  ```ts
  export interface ImportedNote {
    distanceM: number;
    text: string;
  }
  export function snapWaypointsToNotes(
    points: readonly TrackPoint[],
    waypoints: readonly GpxWaypoint[],
  ): ImportedNote[];
  ```

- [ ] **Step 1: Write the failing test**

Create `src/core/geo/track/snapWaypoints.test.ts`:

```ts
import { snapWaypointsToNotes } from './snapWaypoints';
import type { TrackPoint } from '@core/models';
import type { GpxWaypoint } from '@core/geo/gpx';

const pts: TrackPoint[] = [
  { latitude: 46.8, longitude: -71.2, time: 0 },
  { latitude: 46.81, longitude: -71.2, time: 0 },
  { latitude: 46.82, longitude: -71.2, time: 0 },
];

it('anchors a waypoint to the nearest point by cumulative distance', () => {
  const wpts: GpxWaypoint[] = [{ latitude: 46.8101, longitude: -71.2001, name: 'Mid' }];
  const notes = snapWaypointsToNotes(pts, wpts);
  expect(notes).toHaveLength(1);
  expect(notes[0]!.text).toBe('Mid');
  // nearest is index 1; distance ~ first segment length (~1.1km), > 0
  expect(notes[0]!.distanceM).toBeGreaterThan(0);
});

it('combines name and description, sorts by distance, defaults empty label', () => {
  const wpts: GpxWaypoint[] = [
    { latitude: 46.82, longitude: -71.2, name: 'End', description: 'top' },
    { latitude: 46.8, longitude: -71.2 },
  ];
  const notes = snapWaypointsToNotes(pts, wpts);
  expect(notes.map((n) => n.text)).toEqual(['Waypoint', 'End — top']);
  expect(notes[0]!.distanceM).toBeLessThan(notes[1]!.distanceM);
});

it('returns [] when there are no points or no waypoints', () => {
  expect(snapWaypointsToNotes([], [{ latitude: 1, longitude: 1 }])).toEqual([]);
  expect(snapWaypointsToNotes(pts, [])).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/geo/track/snapWaypoints.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/core/geo/track/snapWaypoints.ts`:

```ts
import type { TrackPoint } from '@core/models';
import type { GpxWaypoint } from '@core/geo/gpx';
import { haversineMeters } from '@core/geo/geomath';

/** A note to seed on an imported trail, anchored by distance along it. */
export interface ImportedNote {
  distanceM: number;
  text: string;
}

const labelOf = (w: GpxWaypoint): string => {
  const name = w.name?.trim();
  const desc = w.description?.trim();
  if (name && desc) return `${name} — ${desc}`;
  return name || desc || 'Waypoint';
};

/**
 * Convert GPX <wpt> markers into distance-anchored trail notes by snapping each
 * waypoint to the nearest track point and using that point's cumulative
 * distance from the start. Pure — unit-tested independently of import I/O.
 */
export function snapWaypointsToNotes(
  points: readonly TrackPoint[],
  waypoints: readonly GpxWaypoint[],
): ImportedNote[] {
  if (points.length === 0 || waypoints.length === 0) return [];

  // Cumulative distance to each point index.
  const cum: number[] = new Array(points.length);
  cum[0] = 0;
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1]! + haversineMeters(points[i - 1]!, points[i]!);
  }

  const notes = waypoints.map((w) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = haversineMeters(points[i]!, w);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return { distanceM: cum[bestIdx]!, text: labelOf(w) };
  });

  return notes.sort((a, b) => a.distanceM - b.distanceM);
}
```

Add to `src/core/geo/track/index.ts` (after the `buildImportedTrack` export, line 15):

```ts
export { snapWaypointsToNotes } from './snapWaypoints';
export type { ImportedNote } from './snapWaypoints';
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/core/geo/track/snapWaypoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/geo/track/snapWaypoints.ts src/core/geo/track/snapWaypoints.test.ts src/core/geo/track/index.ts
git commit -m "feat(track): snap GPX waypoints to distance-anchored notes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Seed notes on import (store + import flow + screen)

**Files:**

- Modify: `src/state/libraryStore.ts` (interface line 59 + impl line 182-195)
- Modify: `src/features/library/importGpx.ts`
- Modify: `src/features/library/LibraryScreen.tsx` (`onImportGpx`, ~line 110-111)

**Interfaces:**

- Consumes: `snapWaypointsToNotes`, `ImportedNote` from `@core/geo/track`.
- Produces:
  - `addTrack: (track: Track, fileUri: string, notes?: readonly ImportedNote[]) => void`
  - `ImportedTrack` gains `notes: ImportedNote[]`.

- [ ] **Step 1: Write the failing test**

Create `src/state/libraryStore.notes.test.ts`:

```ts
import { useLibraryStore } from './libraryStore';
import type { Track } from '@core/models';

jest.mock('@data/storage', () => ({
  newId: () => 'n_' + Math.random().toString(36).slice(2, 8),
  deleteFileAt: jest.fn(),
  writeJson: jest.fn(),
}));

const track: Track = {
  id: 't1',
  name: 'T',
  startedAt: 1,
  status: 'finished',
  points: [{ latitude: 0, longitude: 0, time: 0 }],
  stats: {
    distanceM: 0,
    ascentM: 0,
    descentM: 0,
    durationS: 0,
    movingTimeS: 0,
    avgSpeedMps: 0,
    maxSpeedMps: 0,
    minAltitudeM: undefined,
    maxAltitudeM: undefined,
    bbox: undefined,
    pointCount: 1,
  },
};

it('addTrack seeds initial notes with ids', () => {
  useLibraryStore
    .getState()
    .addTrack(track, 'file://t1.gpx', [{ distanceM: 100, text: 'Lookout' }]);
  const saved = useLibraryStore.getState().tracks.find((t) => t.id === 't1');
  expect(saved?.notes).toHaveLength(1);
  expect(saved?.notes?.[0]?.text).toBe('Lookout');
  expect(saved?.notes?.[0]?.distanceM).toBe(100);
  expect(saved?.notes?.[0]?.id).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/state/libraryStore.notes.test.ts`
Expected: FAIL (notes not seeded — `addTrack` ignores the 3rd arg).

- [ ] **Step 3: Implement**

`src/state/libraryStore.ts` — update the interface (line 59):

```ts
  addTrack: (track: Track, fileUri: string, notes?: readonly ImportedNote[]) => void;
```

Add the import near the other `@core` imports at the top:

```ts
import type { ImportedNote } from '@core/geo/track';
```

Replace the `addTrack` implementation (lines 182-195) with:

```ts
  addTrack: (track, fileUri, notes) =>
    set((s) => {
      const seeded =
        notes && notes.length > 0
          ? notes.map((n) => ({
              id: storage.newId(),
              distanceM: Math.max(0, n.distanceM),
              text: n.text.trim(),
              createdAt: Date.now(),
            }))
          : undefined;
      const summary: TrackSummary = {
        id: track.id,
        name: track.name,
        startedAt: track.startedAt,
        endedAt: track.endedAt,
        stats: track.stats,
        fileUri,
        ...(seeded ? { notes: seeded } : {}),
      };
      const next = { ...s, tracks: [summary, ...s.tracks] };
      persist(next);
      return next;
    }),
```

`src/features/library/importGpx.ts` — add imports and thread notes through.
Replace lines 1-3 imports block top with the added import:

```ts
import { buildImportedTrack, snapWaypointsToNotes, type ImportedNote } from '@core/geo/track';
```

Extend `ImportedTrack` (line 7):

```ts
export interface ImportedTrack {
  track: Track;
  fileUri: string;
  notes: ImportedNote[];
}
```

Replace `importOne` body (lines 18-35) so it computes notes:

```ts
async function importOne(asset: DocumentPicker.DocumentPickerAsset): Promise<ImportedTrack> {
  const id = storage.newId();
  const fileUri = await storage.importGpx(asset.uri, id);
  const text = await storage.readFileText(fileUri);
  const { metadata, points, waypoints, hasTrackOrRoutePoints } = parseGpx(text);
  if (points.length === 0) {
    storage.deleteFileAt(fileUri);
    throw new Error('No track points');
  }
  const track = buildImportedTrack({
    id,
    points,
    name: metadata.name,
    fallbackName: asset.name?.replace(/\.gpx$/i, '') ?? 'Imported trail',
    fallbackTime: Date.now(),
  });
  const notes = hasTrackOrRoutePoints ? snapWaypointsToNotes(points, waypoints) : [];
  return { track, fileUri, notes };
}
```

`src/features/library/LibraryScreen.tsx` — in `onImportGpx`, pass notes (line ~111):

```ts
[...result.items].reverse().forEach(({ track, fileUri, notes }) => addTrack(track, fileUri, notes));
```

- [ ] **Step 4: Run tests + full check**

Run: `npx jest src/state/libraryStore.notes.test.ts && npm run check`
Expected: PASS, zero lint warnings.

- [ ] **Step 5: Commit**

```bash
git add src/state/libraryStore.ts src/state/libraryStore.notes.test.ts src/features/library/importGpx.ts src/features/library/LibraryScreen.tsx
git commit -m "feat(import): seed trail notes from GPX waypoints on import

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: On-device verification**

Import a GPX containing `<wpt>` markers (use the emulator + a pushed file). Confirm the imported trail's notes appear in the notes list and as markers on the elevation profile.

---

# PHASE 2 — 2D/3D toggle in the trail view

### Task 4: Add `trailViewMode` to settings

**Files:**

- Modify: `src/state/settingsStore.ts`
- Test: `src/state/settingsStore.trailmode.test.ts`

**Interfaces:**

- Produces: `Settings.trailViewMode: '2d' | '3d'` (default `'3d'`).

- [ ] **Step 1: Write the failing test**

```ts
// src/state/settingsStore.trailmode.test.ts
import { useSettingsStore } from './settingsStore';
jest.mock('@data/storage', () => ({ writeJson: jest.fn(), readJson: async () => null }));

it('defaults trailViewMode to 3d and persists changes', () => {
  expect(useSettingsStore.getState().trailViewMode).toBe('3d');
  useSettingsStore.getState().set('trailViewMode', '2d');
  expect(useSettingsStore.getState().trailViewMode).toBe('2d');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/state/settingsStore.trailmode.test.ts`
Expected: FAIL (`trailViewMode` undefined).

- [ ] **Step 3: Implement** — in `src/state/settingsStore.ts`:

Add to `Settings` interface (after line 30):

```ts
/** Trail detail view: real 3D terrain or a flat 2D map. */
trailViewMode: '2d' | '3d';
```

Add to `DEFAULTS` (line 33-39):

```ts
  trailViewMode: '3d',
```

Add `trailViewMode` to BOTH destructured persist blocks (lines 63-69 and 70-76):

```ts
const {
  tileUrl,
  keepAwakeWhileRecording,
  rotateMapWithHeading,
  minDisplacementM,
  elevationProfileStyle,
  trailViewMode,
} = get();
persist({
  tileUrl,
  keepAwakeWhileRecording,
  rotateMapWithHeading,
  minDisplacementM,
  elevationProfileStyle,
  trailViewMode,
});
```

- [ ] **Step 4: Run tests** — `npx jest src/state/settingsStore.trailmode.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/settingsStore.ts src/state/settingsStore.trailmode.test.ts
git commit -m "feat(settings): add trailViewMode (2d/3d), default 3d

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Build the 2D trail view component

**Files:**

- Create: `src/features/map/Trail2DView.tsx`

**Interfaces:**

- Consumes: `TrackPoint`, `TrackNote` from `@core/models`; `interpolateTrackAtDistance` from `@core/geo/track`; `bboxFromLngLats` from `@core/geo/geomath`; the local `Map` wrapper + MapLibre `Camera`, `ShapeSource`/`LineLayer`, `CircleLayer` already used in `MapScreen.tsx`.
- Produces: `export function Trail2DView(props: { points: readonly TrackPoint[]; notes?: readonly TrackNote[]; })`.

**Note for implementer:** Open `src/features/map/MapScreen.tsx` first and copy the
exact import names and JSX shape it uses for the trail line (`GeoJSONSource` +
`Layer type="line"`) and for the `Map`/`Camera` wrapper. Mirror those names here
rather than guessing — they are the source of truth for this project's MapLibre
binding.

- [ ] **Step 1: Implement the component**

Create `src/features/map/Trail2DView.tsx`:

```tsx
import type { TrackNote, TrackPoint } from '@core/models';
import { interpolateTrackAtDistance } from '@core/geo/track';
import { bboxFromLngLats } from '@core/geo/geomath';
import { useSettingsStore } from '@state/settingsStore';
import { useMapStore } from '@state/mapStore';
import { buildOsmStyle } from '@features/map/osmStyle';
import { Camera, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Map } from './Map';
import type { CameraRef } from '@maplibre/maplibre-react-native';

export function Trail2DView({
  points,
  notes,
}: {
  points: readonly TrackPoint[];
  notes?: readonly TrackNote[];
}) {
  const tileUrl = useSettingsStore((s) => s.tileUrl);
  const basemap = useMapStore((s) => s.basemap);
  const style = useMemo(() => buildOsmStyle(tileUrl, false, basemap), [tileUrl, basemap]);
  const cameraRef = useRef<CameraRef>(null);

  const lngLats = useMemo(
    () => points.map((p) => [p.longitude, p.latitude] as [number, number]),
    [points],
  );

  const lineFeature = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: lngLats },
      properties: {},
    }),
    [lngLats],
  );

  const notesFeature = useMemo(() => {
    const feats = (notes ?? [])
      .map((n) => {
        const at = interpolateTrackAtDistance(points, n.distanceM);
        if (!at) return null;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [at.longitude, at.latitude] },
          properties: { text: n.text },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    return { type: 'FeatureCollection' as const, features: feats };
  }, [notes, points]);

  const bounds = useMemo(() => (lngLats.length > 0 ? bboxFromLngLats(lngLats) : null), [lngLats]);

  return (
    <Map style={styles.fill} mapStyle={style} compass={false}>
      <Camera
        ref={cameraRef}
        bounds={
          bounds
            ? {
                ne: [bounds.maxLng, bounds.maxLat],
                sw: [bounds.minLng, bounds.minLat],
                paddingTop: 60,
                paddingBottom: 60,
                paddingLeft: 40,
                paddingRight: 40,
              }
            : undefined
        }
      />
      <GeoJSONSource id="trail-2d" data={lineFeature}>
        <Layer
          id="trail-2d-line"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': '#3B6FB0', 'line-width': 5, 'line-opacity': 0.9 }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="trail-2d-notes" data={notesFeature}>
        <Layer
          id="trail-2d-notes-dot"
          type="circle"
          paint={{
            'circle-radius': 6,
            'circle-color': '#D76B27',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
          }}
        />
      </GeoJSONSource>
    </Map>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
```

**If any import name differs from MapScreen** (e.g. the camera `bounds` prop shape
or `GeoJSONSource` vs `ShapeSource`), use MapScreen's exact names — adjust this
component to match, do not invent new ones.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors). Fix any import-name mismatches against MapScreen here.

- [ ] **Step 3: Commit**

```bash
git add src/features/map/Trail2DView.tsx
git commit -m "feat(trail): 2D MapLibre trail view with note pins

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wire the 2D/3D toggle into the trail screen

**Files:**

- Modify: `src/features/map/Trail3DGLScreen.tsx`

**Interfaces:**

- Consumes: `useSettingsStore` (`trailViewMode`, `set`), `Trail2DView`, the
  loaded `points` + `notes` already present in the screen.

**Note for implementer:** Read `src/features/map/Trail3DGLScreen.tsx` fully first.
Locate (a) where it loads the track's `points` and the track summary's `notes`,
(b) the top-of-screen header/controls region, and (c) the JSX node that renders
the GL view. The edits below describe exactly what to add at those anchors.

- [ ] **Step 1: Add the toggle state + control**

Near the other store hooks at the top of `Trail3DGLScreen`:

```ts
const trailViewMode = useSettingsStore((s) => s.trailViewMode);
const setSetting = useSettingsStore((s) => s.set);
```

Add the import:

```ts
import { SegmentedButtons } from 'react-native-paper';
import { Trail2DView } from './Trail2DView';
import { useSettingsStore } from '@state/settingsStore';
```

Render this control in the header region (above the map area):

```tsx
<SegmentedButtons
  value={trailViewMode}
  onValueChange={(v) => setSetting('trailViewMode', v as '2d' | '3d')}
  buttons={[
    { value: '2d', label: '2D', icon: 'map-outline' },
    { value: '3d', label: '3D', icon: 'video-3d' },
  ]}
  style={{ margin: 12 }}
/>
```

- [ ] **Step 2: Branch the map area on the mode**

Wrap the existing GL view node so it renders only in 3D, and render `Trail2DView`
in 2D. Use the screen's already-loaded `points` and `notes`:

```tsx
{trailViewMode === '2d' ? (
  <Trail2DView points={points} notes={notes} />
) : (
  /* existing GL view JSX node, unchanged */
)}
```

If the GL view passes notes/waypoints as a prop, also pass `notes` to it so 3D
shows the same pins (the 3D surface already drapes waypoint pins — feed the
trail's `notes` mapped through `interpolateTrackAtDistance` to lat/lon, mirroring
`Trail2DView`'s `notesFeature`).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run check`
Expected: PASS, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add src/features/map/Trail3DGLScreen.tsx
git commit -m "feat(trail): 2D/3D toggle in the trail view, remembered in settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: On-device verification**

Open a trail. Toggle 2D/3D: 2D shows the MapLibre line + orange note pins fit to
bounds; 3D unchanged and also shows note pins; the choice persists after leaving
and reopening.

---

# PHASE 3 — Open a `.gpx` file with Inukshuk

### Task 7: Classify an incoming file URI (pure)

**Files:**

- Create: `src/core/share/incomingFile.ts`
- Test: `src/core/share/incomingFile.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export function classifyIncomingUri(uri: string): { kind: 'gpx' | 'unknown'; name: string };
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { classifyIncomingUri } from './incomingFile';

it('detects .gpx by extension across file/content URIs', () => {
  expect(classifyIncomingUri('file:///x/Sentier%20A.gpx')).toEqual({
    kind: 'gpx',
    name: 'Sentier A',
  });
  expect(classifyIncomingUri('content://downloads/trail.GPX').kind).toBe('gpx');
});

it('falls back to a generic name and unknown kind', () => {
  expect(classifyIncomingUri('content://media/12345')).toEqual({
    kind: 'unknown',
    name: 'Imported trail',
  });
  expect(classifyIncomingUri('file:///x/notes.pdf').kind).toBe('unknown');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/share/incomingFile.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/core/share/incomingFile.ts`:

```ts
/**
 * Decide whether an opened file URI is a GPX we can import, and derive a display
 * name from its path. Pure — handles file:// and content:// URIs. content:// URIs
 * often lack a readable filename, so callers fall back to this name only.
 */
export function classifyIncomingUri(uri: string): { kind: 'gpx' | 'unknown'; name: string } {
  let tail = uri.split('?')[0] ?? uri;
  tail = tail.substring(tail.lastIndexOf('/') + 1);
  let decoded = tail;
  try {
    decoded = decodeURIComponent(tail);
  } catch {
    /* keep raw tail if it is not valid percent-encoding */
  }
  const isGpx = /\.gpx$/i.test(decoded);
  const name = isGpx ? decoded.replace(/\.gpx$/i, '') : 'Imported trail';
  return { kind: isGpx ? 'gpx' : 'unknown', name };
}
```

- [ ] **Step 4: Run tests** — `npx jest src/core/share/incomingFile.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/share/incomingFile.ts src/core/share/incomingFile.test.ts
git commit -m "feat(share): classify incoming .gpx file URIs (pure)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Read an opened URI as text + import-from-URI

**Files:**

- Modify: `src/data/storage.ts` (add `readTextFromUri`, `writeGpxText`)
- Modify: `src/features/library/importGpx.ts` (add `importGpxFromUri`, refactor shared logic)

**Interfaces:**

- Produces:
  - `storage.readTextFromUri(uri: string): Promise<string>`
  - `storage.writeGpxText(id: string, text: string): string`
  - `importGpxFromUri(uri: string, fallbackName: string): Promise<ImportedTrack>`

**⚠ Verify FIRST (the spec's main risk):** before relying on this, confirm an
Android `content://` GPX can be read. Step 0 below is an on-device smoke test.

- [ ] **Step 0: On-device read smoke test**

Temporarily add a button or use the emulator: pick a GPX via the existing picker,
note its `content://` provenance, and confirm `new File(uri).text()` returns the
XML. If it throws for `content://`, switch `readTextFromUri` to the documented
fallback (below) before continuing.

- [ ] **Step 1: Implement storage helpers**

In `src/data/storage.ts` add near the GPX helpers:

```ts
/**
 * Read a file's text from any URI, including the content:// URIs delivered by
 * Android "Open with" intents (the picker only ever gives us a cached file://).
 * GPX is text, so we read it directly instead of a binary copy.
 */
export async function readTextFromUri(uri: string): Promise<string> {
  return new File(uri).text();
}

/** Write GPX text into app storage under a stable id; returns the new file uri. */
export function writeGpxText(id: string, text: string): string {
  ensureStorage();
  const dest = new File(tracksDir(), `${id}.gpx`);
  if (dest.exists) dest.delete();
  dest.create();
  dest.write(text);
  return dest.uri;
}
```

**Fallback (only if Step 0 showed `File.text()` can't read content://):** import
`* as LegacyFS from 'expo-file-system/legacy'` and implement `readTextFromUri`
as `LegacyFS.readAsStringAsync(uri)`.

- [ ] **Step 2: Refactor importGpx + add importGpxFromUri**

In `src/features/library/importGpx.ts`, extract the shared tail and add the new
entry point:

```ts
function buildFromGpxText(
  text: string,
  id: string,
  fileUri: string,
  fallbackName: string,
): ImportedTrack {
  const { metadata, points, waypoints, hasTrackOrRoutePoints } = parseGpx(text);
  if (points.length === 0) {
    storage.deleteFileAt(fileUri);
    throw new Error('No track points');
  }
  const track = buildImportedTrack({
    id,
    points,
    name: metadata.name,
    fallbackName,
    fallbackTime: Date.now(),
  });
  const notes = hasTrackOrRoutePoints ? snapWaypointsToNotes(points, waypoints) : [];
  return { track, fileUri, notes };
}

async function importOne(asset: DocumentPicker.DocumentPickerAsset): Promise<ImportedTrack> {
  const id = storage.newId();
  const fileUri = await storage.importGpx(asset.uri, id);
  const text = await storage.readFileText(fileUri);
  return buildFromGpxText(
    text,
    id,
    fileUri,
    asset.name?.replace(/\.gpx$/i, '') ?? 'Imported trail',
  );
}

/** Import a GPX from an arbitrary opened URI (e.g. an Android "Open with" intent). */
export async function importGpxFromUri(uri: string, fallbackName: string): Promise<ImportedTrack> {
  const id = storage.newId();
  const text = await storage.readTextFromUri(uri);
  const fileUri = storage.writeGpxText(id, text);
  return buildFromGpxText(text, id, fileUri, fallbackName);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/storage.ts src/features/library/importGpx.ts
git commit -m "feat(import): importGpxFromUri reading content:// opened files

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Root feedback store + snackbar

**Files:**

- Create: `src/state/importFeedbackStore.ts`
- Create: `src/features/share/ImportFeedbackSnackbar.tsx`

**Interfaces:**

- Produces:
  - `useImportFeedbackStore` with `{ message: string | null; show: (m: string) => void; clear: () => void }`
  - `<ImportFeedbackSnackbar />` root component.

- [ ] **Step 1: Implement the store**

Create `src/state/importFeedbackStore.ts`:

```ts
import { create } from 'zustand';

/** One-shot, app-global message for files imported via "Open with". */
interface ImportFeedbackState {
  message: string | null;
  show: (m: string) => void;
  clear: () => void;
}

export const useImportFeedbackStore = create<ImportFeedbackState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
```

- [ ] **Step 2: Implement the snackbar**

Create `src/features/share/ImportFeedbackSnackbar.tsx`:

```tsx
import { useImportFeedbackStore } from '@state/importFeedbackStore';
import { Snackbar } from 'react-native-paper';

export function ImportFeedbackSnackbar() {
  const message = useImportFeedbackStore((s) => s.message);
  const clear = useImportFeedbackStore((s) => s.clear);
  return (
    <Snackbar visible={message !== null} onDismiss={clear} duration={3500}>
      {message ?? ''}
    </Snackbar>
  );
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/state/importFeedbackStore.ts src/features/share/ImportFeedbackSnackbar.tsx
git commit -m "feat(share): root import-feedback store + snackbar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Incoming-file hook + mount at root

**Files:**

- Create: `src/features/share/useIncomingFile.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**

- Consumes: `expo-linking`, `classifyIncomingUri`, `importGpxFromUri`,
  `useLibraryStore.addTrack`, `useImportFeedbackStore.show`, `expo-router`.

- [ ] **Step 1: Implement the hook**

Create `src/features/share/useIncomingFile.ts`:

```ts
import { classifyIncomingUri } from '@core/share/incomingFile';
import { importGpxFromUri } from '@features/library/importGpx';
import { useImportFeedbackStore } from '@state/importFeedbackStore';
import { useLibraryStore } from '@state/libraryStore';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';

/**
 * Handle a `.gpx` opened via the OS "Open with" flow: read it, import it (with
 * its waypoint notes), add it to the library, jump to Library, and report the
 * result. Handles both cold start (getInitialURL) and warm (url listener).
 */
export function useIncomingFile(): void {
  const addTrack = useLibraryStore((s) => s.addTrack);
  const show = useImportFeedbackStore((s) => s.show);
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    const handle = async (uri: string | null) => {
      if (!uri || handled.current.has(uri)) return;
      const { kind, name } = classifyIncomingUri(uri);
      if (kind !== 'gpx') return;
      handled.current.add(uri);
      try {
        const { track, fileUri, notes } = await importGpxFromUri(uri, name);
        if (!active) return;
        addTrack(track, fileUri, notes);
        router.navigate('/(tabs)/library');
        show(`Imported ${track.name}`);
      } catch {
        if (active) show('Could not import that GPX file');
      }
    };

    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => void handle(e.url));
    return () => {
      active = false;
      sub.remove();
    };
  }, [addTrack, show]);
}
```

- [ ] **Step 2: Mount at root**

In `app/_layout.tsx`: call the hook inside `RootLayout` (after the existing
`useEffect` hydration) and render the snackbar inside the providers, after
`<Stack>...</Stack>`:

```tsx
import { useIncomingFile } from '@features/share/useIncomingFile';
import { ImportFeedbackSnackbar } from '@features/share/ImportFeedbackSnackbar';
// ...
  useIncomingFile();
// ...
            </Stack>
            <ImportFeedbackSnackbar />
```

- [ ] **Step 3: Typecheck + lint** — `npm run check` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/share/useIncomingFile.ts app/_layout.tsx
git commit -m "feat(share): import a .gpx opened via the OS open-with flow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Register the native file association

**Files:**

- Modify: `app.config.ts`

- [ ] **Step 1: Add Android intent filters**

In `app.config.ts`, inside the `android` object (after `permissions`, ~line 45):

```ts
    intentFilters: [
      {
        action: 'VIEW',
        category: ['DEFAULT', 'BROWSABLE'],
        data: [
          { scheme: 'content', mimeType: 'application/gpx+xml' },
          { scheme: 'content', mimeType: 'application/xml' },
          { scheme: 'content', mimeType: 'application/octet-stream' },
          { scheme: 'content', pathPattern: '.*\\.gpx' },
          { scheme: 'file', pathPattern: '.*\\.gpx' },
        ],
      },
    ],
```

- [ ] **Step 2: Add iOS document type**

In `app.config.ts`, inside `ios.infoPlist` (after `ITSAppUsesNonExemptEncryption`):

```ts
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'GPS Exchange Format',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['com.topografix.gpx'],
        },
      ],
      UTImportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'com.topografix.gpx',
          UTTypeConformsTo: ['public.xml'],
          UTTypeDescription: 'GPS Exchange Format',
          UTTypeTagSpecification: { 'public.filename-extension': ['gpx'] },
        },
      ],
```

- [ ] **Step 3: Bump version for the build**

Set `version: '1.0.0'` (already) and `versionCode: 42` in `app.config.ts`.

- [ ] **Step 4: Sanity check config**

Run: `npx expo config --type public > /dev/null && echo OK`
Expected: `OK` (config evaluates without error).

- [ ] **Step 5: Commit**

```bash
git add app.config.ts
git commit -m "feat(android,ios): register Inukshuk as a .gpx file handler (vc42)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: On-device verification (requires a build)**

Build vc42, install, download a `.gpx`, tap it in a file manager / browser, choose
Inukshuk → the trail imports (with its notes), lands on Library, and the snackbar
shows. Test both cold start (app closed) and warm (app already open).

---

## Final integration

- [ ] Run full `npm run check` — all tests green, zero lint warnings.
- [ ] Roll the vc42 build (versionName 1.0.0, versionCode 42), verify the three features on-device, submit to the internal track, delete the AAB.

## Self-review notes (coverage)

- Spec Phase 1 (parse + snap + store + show) → Tasks 1–3 (+profile renders notes for free).
- Spec Phase 2 (settings + 2D view + toggle + 3D pins) → Tasks 4–6.
- Spec Phase 3 (native assoc + importGpxFromUri + hook + content:// risk) → Tasks 7–11, with the content:// read verified in Task 8 Step 0.
- Out-of-scope items (main-map pins, PDF association) intentionally absent.
