# Offline region download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user draw a box on the 2D map to download that region's basemap tiles for offline use, with a "Locally downloaded only" toggle and an Offline-maps manager in Settings.

**Architecture:** Pure tile-math in `src/core` (tested); a thin wrapper over MapLibre's `OfflineManager`/`NetworkManager` in `src/data`; a Zustand `offlineStore`; a region-select overlay + layers-menu toggle on the map; a manager section in Settings. MapLibre stores tiles in its persistent native DB. The MapLibre offline API is JS over the already-linked native module, so **this whole feature ships via OTA — no rebuild**.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript (strict + noUncheckedIndexedAccess), Zustand, `@maplibre/maplibre-react-native` v11 (`OfflineManager`, `OfflinePack`, `NetworkManager`), Jest.

## Global Constraints

- `src/core/**` stays pure — no `react-native`/`expo` imports; new core logic gets co-located `*.test.ts`.
- Path aliases: `@core`, `@data`, `@state`, `@features`, `@ui`, `@lib`, `@/`.
- Strict TS: index access is `T | undefined` — guard, don't cast.
- `npm run check` (typecheck + lint **zero** warnings + prettier single-quote/semicolon/width-100 + tests) passes before each task's final commit.
- Scope is the **2D basemap** only. `maxZoom = 17`. Default tile cap **25000** tiles. `mapStyle` for a pack = `JSON.stringify(buildOsmStyle(tileUrl, false, basemap))`.
- MapLibre `LngLatBounds = [west, south, east, north]` (a 4-number tuple).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- Create `src/core/geo/tiles.ts` — pure slippy-tile math (`tileCountForRegion`, `estimateBytes`, `overviewZoomFor`) + `src/core/geo/tiles.test.ts`.
- Create `src/data/offline.ts` — MapLibre offline wrapper (`OfflineRegion`, `createRegionPack`, `listRegionPacks`, `deleteRegionPack`, `setOfflineOnly`).
- Create `src/state/offlineStore.ts` — Zustand store (regions, offlineOnly, progress).
- Create `src/features/map/RegionSelectOverlay.tsx` — draggable box + estimate + confirm.
- Modify `src/features/map/MapScreen.tsx` — download button, region-select mode, layers-menu "Locally downloaded only" item, apply offlineOnly.
- Create `src/features/settings/OfflineMapsSection.tsx` + modify `src/features/settings/SettingsScreen.tsx`.
- Modify `src/state/settingsStore.ts` — persist `offlineOnly`.

---

### Task 1: Pure tile math

**Files:**

- Create: `src/core/geo/tiles.ts`
- Test: `src/core/geo/tiles.test.ts`

**Interfaces:**

- Consumes: `BoundingBox` from `@core/models` (`{ minLat, minLng, maxLat, maxLng }`).
- Produces:

  ```ts
  export function tileCountForRegion(b: BoundingBox, minZoom: number, maxZoom: number): number;
  export function overviewZoomFor(b: BoundingBox, maxTilesPerSide?: number): number; // default 2
  export function estimateBytes(tileCount: number, basemap: 'map' | 'satellite'): number;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/core/geo/tiles.test.ts`:

```ts
import { tileCountForRegion, overviewZoomFor, estimateBytes } from './tiles';
import type { BoundingBox } from '@core/models';

const world: BoundingBox = { minLat: -85, minLng: -180, maxLat: 85, maxLng: 180 };
const small: BoundingBox = { minLat: 46.8, minLng: -71.22, maxLat: 46.83, maxLng: -71.18 };

it('counts 1 tile for the whole world at z0', () => {
  expect(tileCountForRegion(world, 0, 0)).toBe(1);
});

it('counts the covering tiles across a zoom range (monotonic, > the single top)', () => {
  const z10to12 = tileCountForRegion(small, 10, 12);
  const z10to11 = tileCountForRegion(small, 10, 11);
  expect(z10to12).toBeGreaterThan(z10to11);
  expect(tileCountForRegion(small, 10, 10)).toBeGreaterThanOrEqual(1);
});

it('overviewZoomFor returns a low zoom whose span fits in <= maxTilesPerSide', () => {
  const z = overviewZoomFor(small, 2);
  expect(z).toBeGreaterThanOrEqual(0);
  expect(z).toBeLessThanOrEqual(17);
});

it('estimateBytes scales with tile count and basemap', () => {
  expect(estimateBytes(100, 'map')).toBeGreaterThan(0);
  expect(estimateBytes(200, 'map')).toBeCloseTo(2 * estimateBytes(100, 'map'));
  expect(estimateBytes(100, 'satellite')).toBeGreaterThan(estimateBytes(100, 'map'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/core/geo/tiles.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/core/geo/tiles.ts`:

```ts
import type { BoundingBox } from '@core/models';

/** Web-mercator X tile index for a longitude at zoom z. */
const lngToX = (lng: number, z: number): number => Math.floor(((lng + 180) / 360) * 2 ** z);

/** Web-mercator Y tile index for a latitude at zoom z (clamped to mercator range). */
const latToY = (lat: number, z: number): number => {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
  return Math.max(0, Math.min(2 ** z - 1, y));
};

/** Tiles a bbox spans at a single zoom: (xCount) * (yCount). */
function tilesAtZoom(b: BoundingBox, z: number): number {
  const x0 = lngToX(b.minLng, z);
  const x1 = lngToX(b.maxLng, z);
  const y0 = latToY(b.maxLat, z); // north = smaller y
  const y1 = latToY(b.minLat, z);
  return (Math.abs(x1 - x0) + 1) * (Math.abs(y1 - y0) + 1);
}

/** Total tiles a region covers across an inclusive zoom range. */
export function tileCountForRegion(b: BoundingBox, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) total += tilesAtZoom(b, z);
  return total;
}

/** Lowest zoom whose tile span fits the region within `maxTilesPerSide` per axis. */
export function overviewZoomFor(b: BoundingBox, maxTilesPerSide = 2): number {
  for (let z = 0; z <= 17; z++) {
    const xSpan = Math.abs(lngToX(b.maxLng, z) - lngToX(b.minLng, z)) + 1;
    const ySpan = Math.abs(latToY(b.minLat, z) - latToY(b.maxLat, z)) + 1;
    if (xSpan > maxTilesPerSide || ySpan > maxTilesPerSide) return Math.max(0, z - 1);
  }
  return 17;
}

// Rough average compressed tile sizes: Esri satellite JPEG tiles are heavier
// than OSM/street PNG tiles. Used only for a pre-download size estimate.
const AVG_BYTES: Record<'map' | 'satellite', number> = { map: 18_000, satellite: 30_000 };

export function estimateBytes(tileCount: number, basemap: 'map' | 'satellite'): number {
  return tileCount * AVG_BYTES[basemap];
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/core/geo/tiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/geo/tiles.ts src/core/geo/tiles.test.ts
git commit -m "feat(core): slippy-tile math for offline region estimates

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: MapLibre offline wrapper

**Files:**

- Create: `src/data/offline.ts`

**Interfaces:**

- Consumes: `OfflineManager`, `NetworkManager` from `@maplibre/maplibre-react-native`; `BoundingBox` from `@core/models`.
- Produces:

  ```ts
  export interface OfflineRegion {
    id: string;
    label: string;
    basemap: 'map' | 'satellite' | 'relief';
    bounds: BoundingBox;
    sizeBytes: number;
    complete: boolean;
  }
  export function createRegionPack(
    args: {
      id: string;
      label: string;
      basemap: OfflineRegion['basemap'];
      styleJSON: string;
      bounds: BoundingBox;
      minZoom: number;
      maxZoom: number;
    },
    onProgress: (pct: number, sizeBytes: number) => void,
  ): Promise<void>;
  export function listRegionPacks(): Promise<OfflineRegion[]>;
  export function deleteRegionPack(id: string): Promise<void>;
  export function setOfflineOnly(on: boolean): void;
  export function setTileLimit(n: number): void;
  ```

- [ ] **Step 1: Implement** (no unit test — native API; verified on-device in Task 7)

Create `src/data/offline.ts`:

```ts
import type { BoundingBox } from '@core/models';
import { OfflineManager, NetworkManager } from '@maplibre/maplibre-react-native';

export interface OfflineRegion {
  id: string;
  label: string;
  basemap: 'map' | 'satellite' | 'relief';
  bounds: BoundingBox;
  sizeBytes: number;
  complete: boolean;
}

// MapLibre LngLatBounds is [west, south, east, north].
const toLngLatBounds = (b: BoundingBox): [number, number, number, number] => [
  b.minLng,
  b.minLat,
  b.maxLng,
  b.maxLat,
];

interface PackMeta {
  label: string;
  basemap: OfflineRegion['basemap'];
}

function regionFromPack(pack: {
  name: string;
  bounds: [number, number, number, number];
  metadata: PackMeta;
  status?: { percentage: number; completedTileSize: number };
}): OfflineRegion {
  const [w, s, e, n] = pack.bounds;
  return {
    id: pack.name,
    label: pack.metadata?.label ?? 'Region',
    basemap: pack.metadata?.basemap ?? 'map',
    bounds: { minLng: w, minLat: s, maxLng: e, maxLat: n },
    sizeBytes: pack.status?.completedTileSize ?? 0,
    complete: (pack.status?.percentage ?? 0) >= 100,
  };
}

export function createRegionPack(
  args: {
    id: string;
    label: string;
    basemap: OfflineRegion['basemap'];
    styleJSON: string;
    bounds: BoundingBox;
    minZoom: number;
    maxZoom: number;
  },
  onProgress: (pct: number, sizeBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    OfflineManager.createPack(
      {
        name: args.id,
        mapStyle: args.styleJSON,
        bounds: toLngLatBounds(args.bounds),
        minZoom: args.minZoom,
        maxZoom: args.maxZoom,
        metadata: { label: args.label, basemap: args.basemap },
      },
      (_pack, status) => {
        onProgress(status.percentage, status.completedTileSize);
        if (status.percentage >= 100) resolve();
      },
      (_pack, err) => reject(err instanceof Error ? err : new Error(String(err))),
    ).catch(reject);
  });
}

export async function listRegionPacks(): Promise<OfflineRegion[]> {
  const packs = await OfflineManager.getPacks();
  const out: OfflineRegion[] = [];
  for (const p of packs) {
    const status = await p.status().catch(() => undefined);
    out.push(
      regionFromPack({
        name: p.name,
        bounds: p.bounds as [number, number, number, number],
        metadata: (p.metadata ?? {}) as PackMeta,
        status,
      }),
    );
  }
  return out;
}

export async function deleteRegionPack(id: string): Promise<void> {
  await OfflineManager.deletePack(id);
}

/** Force MapLibre to serve only cached/pack tiles (true) or fetch normally (false). */
export function setOfflineOnly(on: boolean): void {
  NetworkManager.setConnected(!on);
}

export function setTileLimit(n: number): void {
  OfflineManager.setTileCountLimit(n);
}
```

**Note for implementer:** the exact shapes of `OfflinePack.metadata`, `.bounds`, and `.status()` are typed in `node_modules/@maplibre/maplibre-react-native/lib/typescript/.../OfflinePack.d.ts` (`OfflinePackStatus = { percentage; completedTileSize; … }`). If `metadata` comes back as a JSON string rather than an object, `JSON.parse` it in `regionFromPack`; if `status()` is a property not a method, read it directly. Adjust to the real types — keep the exported `OfflineRegion` shape.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (fix any prop-shape mismatch against the real `.d.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/data/offline.ts
git commit -m "feat(data): MapLibre offline-pack wrapper (create/list/delete/offline-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Offline store + persist offlineOnly

**Files:**

- Create: `src/state/offlineStore.ts`
- Modify: `src/state/settingsStore.ts` (add `offlineOnly: boolean`, default `false`, in `Settings`, `DEFAULTS`, and BOTH persist-destructure blocks — mirror `trailViewMode`)

**Interfaces:**

- Consumes: `OfflineRegion`, `createRegionPack`, `listRegionPacks`, `deleteRegionPack`, `setOfflineOnly`, `setTileLimit` from `@data/offline`; `useSettingsStore` for the persisted `offlineOnly`.
- Produces:

  ```ts
  interface OfflineState {
    regions: OfflineRegion[];
    progress: { id: string; pct: number; sizeBytes: number } | null;
    hydrate: () => Promise<void>;
    download: (args: { id; label; basemap; styleJSON; bounds; minZoom; maxZoom }) => Promise<void>;
    remove: (id: string) => Promise<void>;
  }
  export const useOfflineStore: UseBoundStore<...>;
  ```

- [ ] **Step 1: Implement** (no unit test — wraps native; on-device verified)

Create `src/state/offlineStore.ts`:

```ts
import {
  createRegionPack,
  deleteRegionPack,
  listRegionPacks,
  setTileLimit,
  type OfflineRegion,
} from '@data/offline';
import { create } from 'zustand';

interface OfflineState {
  regions: OfflineRegion[];
  progress: { id: string; pct: number; sizeBytes: number } | null;
  hydrate: () => Promise<void>;
  download: (args: {
    id: string;
    label: string;
    basemap: OfflineRegion['basemap'];
    styleJSON: string;
    bounds: OfflineRegion['bounds'];
    minZoom: number;
    maxZoom: number;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  regions: [],
  progress: null,

  hydrate: async () => {
    setTileLimit(50_000); // headroom above the 25k UI cap
    set({ regions: await listRegionPacks() });
  },

  download: async (args) => {
    set({ progress: { id: args.id, pct: 0, sizeBytes: 0 } });
    try {
      await createRegionPack(args, (pct, sizeBytes) =>
        set({ progress: { id: args.id, pct, sizeBytes } }),
      );
    } finally {
      set({ progress: null, regions: await listRegionPacks() });
    }
  },

  remove: async (id) => {
    await deleteRegionPack(id);
    set({ regions: get().regions.filter((r) => r.id !== id) });
  },
}));
```

`settingsStore.ts`: add `offlineOnly: boolean` exactly as `trailViewMode` was added (interface field, `DEFAULTS.offlineOnly = false`, and include `offlineOnly` in BOTH the destructure and the `persist({...})` object in `set`).

- [ ] **Step 2: Typecheck + lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/state/offlineStore.ts src/state/settingsStore.ts
git commit -m "feat(state): offlineStore (regions + download progress) + persist offlineOnly

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Region-select overlay (draggable box + estimate)

**Files:**

- Create: `src/features/map/RegionSelectOverlay.tsx`

**Interfaces:**

- Consumes: `tileCountForRegion`, `overviewZoomFor`, `estimateBytes` from `@core/geo/tiles`; `formatBytes` (add to `@lib/format` if absent — `${(n/1e6).toFixed(0)} MB`).
- Produces: `export function RegionSelectOverlay(props: { toGeo: (screen: { x: number; y: number }) => Promise<[number, number]> | [number, number]; basemap: 'map' | 'satellite'; onConfirm: (bounds: BoundingBox, minZoom: number, maxZoom: number) => void; onCancel: () => void })`.

**Note for implementer:** the box lives in screen space (an absolutely-positioned `View` over the map) with four corner handles driven by `PanResponder` (mirror the gesture pattern in `Trail3DGLScreen`'s `pan`). On every change, convert the box's top-left and bottom-right **screen** points to geo via `props.toGeo` → a `BoundingBox`, then compute `minZoom = overviewZoomFor(bbox)`, `maxZoom = 17`, `tiles = tileCountForRegion(bbox, minZoom, maxZoom)`, `bytes = estimateBytes(tiles, basemap === 'satellite' ? 'satellite' : 'map')`. Show "≈ {tiles} tiles · {MB} MB" in a bottom bar with **Cancel** and a **Download** button that is **disabled when `tiles > 25000`** (show "Too large — shrink the box"). Confirm calls `onConfirm(bbox, minZoom, maxZoom)`.

- [ ] **Step 1: Implement the component** (full code; UI verified on-device)

Write the component per the note above: an overlay `View` (`StyleSheet.absoluteFill`-style via explicit inset props), an inner draggable rectangle with 4 corner `Pressable`/`PanResponder` handles, and a bottom `Surface` bar with the live estimate + Cancel/Download (`react-native-paper` `Button`). Keep the geo conversion behind the injected `toGeo` so this file has no MapLibre import.

- [ ] **Step 2: Typecheck + lint** — `npm run check` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/map/RegionSelectOverlay.tsx src/lib/format.ts
git commit -m "feat(map): region-select overlay with live tile/size estimate + cap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the map screen

**Files:**

- Modify: `src/features/map/MapScreen.tsx`

**Interfaces:**

- Consumes: `useOfflineStore`, `RegionSelectOverlay`, `buildOsmStyle` (already imported), `useSettingsStore` (`offlineOnly`, `set`), `setOfflineOnly` from `@data/offline`, `storage.newId`.

**Note for implementer:** Read `MapScreen.tsx` first. Add:

1. State `const [selecting, setSelecting] = useState(false)`.
2. A **download control** in the right-side `IconButton` stack (mirror the `crosshairs-gps` / Layers buttons; icon `tray-arrow-down`, `accessibilityLabel="Download offline area"`) shown only in the 2D branch (`!terrain3d`), that sets `selecting(true)`.
3. When `selecting`, render `<RegionSelectOverlay toGeo={...} basemap={basemap === 'satellite' ? 'satellite' : 'map'} onCancel={() => setSelecting(false)} onConfirm={(bbox, minZoom, maxZoom) => { setSelecting(false); void useOfflineStore.getState().download({ id: storage.newId(), label: <date/area label>, basemap, styleJSON: JSON.stringify(buildOsmStyle(tileUrl, false, basemap)), bounds: bbox, minZoom, maxZoom }); }} />`.
   - `toGeo({x,y})` → use the MapLibre `<Map>`/Camera ref's `getCoordinateFromView([x, y])` (returns `[lng, lat]`). Confirm the method on the ref exposed by the local `Map` wrapper; if the wrapper doesn't forward it, add a `ref` passthrough. This is the one integration risk — verify it returns sane lng/lat before building the rest.
4. A small **download-progress** banner/snackbar from `useOfflineStore((s) => s.progress)` (e.g. "Downloading map… {pct}%").
5. In the **layers menu**, add a `Menu.Item` / checkbox **"Locally downloaded only"** bound to `useSettingsStore((s) => s.offlineOnly)`; on toggle: `set('offlineOnly', next); setOfflineOnly(next);`.
6. On mount, apply the persisted value once: `useEffect(() => setOfflineOnly(offlineOnly), [])` and `void useOfflineStore.getState().hydrate()`.

- [ ] **Step 1: Implement the wiring** per the note. Use the established `IconButton`/`Menu.Item` patterns already in the file.

- [ ] **Step 2: Typecheck + lint** — `npm run check` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/map/MapScreen.tsx
git commit -m "feat(map): download-area control, region select, locally-downloaded-only toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Offline-maps section in Settings

**Files:**

- Create: `src/features/settings/OfflineMapsSection.tsx`
- Modify: `src/features/settings/SettingsScreen.tsx` (render `<OfflineMapsSection />` as a new `List.Section`)

**Interfaces:**

- Consumes: `useOfflineStore` (`regions`, `remove`, `hydrate`), `formatBytes` from `@lib/format`.

**Note for implementer:** `OfflineMapsSection` renders a `List.Section` titled "Offline maps": for each `region`, a `List.Item` showing `label`, a `description` of `"{basemap} · {formatBytes(sizeBytes)}"`, and a trailing delete `IconButton` (`trash-can-outline`) calling `remove(region.id)`. Show a total-size line and an empty state ("No offline maps yet — draw an area on the map to download one."). Call `hydrate()` in a mount effect. Insert it into `SettingsScreen`'s `ScrollView` as its own `List.Section` (follow the existing `List.Section` blocks).

- [ ] **Step 1: Implement** both files.

- [ ] **Step 2: Typecheck + lint** — `npm run check` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/settings/OfflineMapsSection.tsx src/features/settings/SettingsScreen.tsx
git commit -m "feat(settings): Offline maps manager (list, size, delete, total)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: On-device verification (no rebuild — OTA-able)

**Files:** none (verification + OTA).

- [ ] **Step 1: Full check** — `npm run check` → all green.

- [ ] **Step 2: Emulator verification** (the native offline DB can't be unit-tested):
  - On the 2D map, tap **Download offline area**; draw a small box; confirm the **estimate** updates and a too-large box disables Download. Download it; the progress banner runs to 100%.
  - Open **Settings → Offline maps**: the region is listed with its size; total shown.
  - Toggle **Locally downloaded only** ON, then `adb shell svc data disable` / use the emulator's airplane mode (or just pan): the downloaded box renders; **outside it is blank**. Toggle OFF → tiles load again.
  - Delete the region in Settings → it's gone and `getPacks()` no longer lists it.

- [ ] **Step 3: Ship** — OTA to the live runtimes (this is JS-only):
  ```bash
  # for RT in 1.0.8 1.0.7 1.0.0: sed version, eas update --branch production --environment production --platform android, restore
  ```

## Self-review (coverage)

- Spec "tile math / estimate / cap" → Task 1 + the cap check in Task 4.
- Spec "MapLibre wrapper (create/list/delete/offline-only)" → Task 2.
- Spec "offlineStore + persisted offlineOnly" → Task 3.
- Spec "draw-a-box region select + live estimate" → Task 4.
- Spec "map download button + locally-downloaded-only toggle" → Task 5.
- Spec "Offline maps manager in Settings" → Task 6.
- Spec "on-device verification; OTA" → Task 7.
- Out-of-scope items (3D-terrain offline, PDF, auto-refresh) intentionally absent.

**Known integration risk (Task 5):** `getCoordinateFromView` must be reachable on the map ref through the local `Map` wrapper — verify first; if not exposed, add a ref passthrough before building the overlay wiring.
