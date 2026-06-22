# Offline region download — design

**Date:** 2026-06-21
**Status:** awaiting spec review

## Goal

Let the user download a chosen rectangular region of the **2D basemap** to the
device so the map works with no signal, and add a **"Locally downloaded only"**
layer option that renders cached tiles only (no network). Downloaded regions are
managed (size, delete) in Settings.

Scope is the **2D basemap** (OSM street / Esri satellite / Esri street). Imported
PDF maps are already offline. 3D terrain (DEM + drape) offline is a separate
follow-up.

## Why MapLibre's offline API

MapLibre RN ships a battle-tested offline subsystem that stores tiles in a
**persistent native DB** (not the OS-evictable cache). Confirmed available in the
installed `@maplibre/maplibre-react-native` v11:

- `OfflineManager.createPack(options, onProgress, onError) => Promise<OfflinePack>`
  where `options: { mapStyle: string; bounds: LngLatBounds; minZoom?: number;
maxZoom?: number; metadata?: ... }`. `mapStyle` is a **string** — we pass
  `JSON.stringify(buildOsmStyle(tileUrl, false, basemap))` (our inline raster
  style serialized), so packs work with our key-free raster basemaps.
- `OfflineManager.getPacks() => OfflinePack[]`, `deletePack(name)`,
  `setTileCountLimit(n)`.
- `OfflinePack`: `name`, `bounds`, `metadata`, `status` (completed/required
  resource + tile counts and **bytes**, plus % and download state), `pause`,
  `resume`.
- `NetworkManager.setConnected(false)` forces MapLibre to serve only cached/pack
  tiles and make **no** network requests — exactly the "locally downloaded only"
  behaviour.

## Decisions (from brainstorming, approved)

- **Region select:** draw an **adjustable box** over the map (drag corners), then
  confirm.
- **Zoom depth:** from the region's overview zoom down to **z17** (high detail),
  with a **live tile-count + byte estimate** shown before downloading and a
  **hard cap** (default ~25 000 tiles ≈ ~400–600 MB) that blocks oversized
  downloads with a "shrink the box" message.
- **"Locally downloaded only"** (layer menu): ON → `NetworkManager.setConnected(
false)`, map shows only downloaded tiles, un-downloaded areas render blank, zero
  data used. OFF → normal (live fetch; cached tiles still serve instantly).
- **Download button:** on the map screen (right-side control stack).
- **Manage:** an **"Offline maps"** section in Settings — each region's label,
  basemap, size and area, with delete; plus total storage used.

## Architecture & components

Designed as small, independently-testable units.

1. **`src/core/geo/tiles.ts`** (pure, unit-tested)
   - `tileCountForRegion(bounds, minZoom, maxZoom): number` — sum of XYZ tiles a
     bounds covers across the zoom range (standard slippy-tile math).
   - `estimateBytes(tileCount, basemap): number` — tileCount × an
     average-bytes-per-tile constant per basemap (raster PNG vs JPEG).
   - `overviewZoomFor(bounds): number` — the lowest zoom whose tile span fits the
     region in a few tiles (the pack's `minZoom`).

2. **`src/data/offline.ts`** — thin wrapper over MapLibre:
   - `createRegionPack(args: { id; label; basemap; styleJSON; bounds; minZoom;
maxZoom }, onProgress): Promise<void>` → `OfflineManager.createPack({
mapStyle: styleJSON, bounds, minZoom, maxZoom, metadata: JSON.stringify({
label, basemap }) }, …)`.
   - `listRegionPacks(): Promise<OfflineRegion[]>` → maps `getPacks()` to a plain
     `OfflineRegion` ({ id, label, basemap, bounds, sizeBytes, complete }).
   - `deleteRegionPack(id)`, `setOfflineOnly(on: boolean)` (via NetworkManager).

3. **`src/state/offlineStore.ts`** (Zustand) — `regions: OfflineRegion[]`,
   `offlineOnly: boolean` (persisted to settings storage), `downloading` progress
   state; `hydrate()` from `listRegionPacks()`; actions to add/remove/refresh and
   `setOfflineOnly` (calls the wrapper + persists).

4. **`src/features/map/RegionSelectOverlay.tsx`** — an absolutely-positioned
   adjustable rectangle over the map with four draggable corner handles; a bottom
   bar showing the **live estimate** (tiles + MB, computed from the box's geo
   bounds via `tileCountForRegion`) and **Confirm / Cancel**. Confirm → a small
   name dialog → kicks off the download.
   - The box's screen rect → geo bounds via the map's `getCoordinateFromView` (or
     by tracking the visible-bounds and the box's fractional position).

5. **Map screen wiring** (`MapScreen.tsx`)
   - A "Download offline area" control in the right-side stack → toggles
     region-select mode (renders `RegionSelectOverlay`).
   - A **"Locally downloaded only"** item in the existing layers menu, bound to
     `offlineStore.offlineOnly`.

6. **`src/features/settings/OfflineMapsSection.tsx`** — lists `regions` (label,
   basemap chip, size, area), each with a delete button; shows total size; empty
   state when none. Rendered in `SettingsScreen`.

## Data flow

Download: tap **Download area** → region-select mode → drag the box → live
estimate recomputes on every change → **Confirm** (blocked if over the cap) →
name dialog → `offlineStore` starts the download via `createRegionPack` for the
**active basemap** (style serialized to JSON) → progress bar from the pack's
`status` events → on completion the region is added to the store + Settings list.

Offline-only: layers menu toggle → `offlineStore.setOfflineOnly(true)` →
`NetworkManager.setConnected(false)` → the existing `<Map>` now serves only
cached/pack tiles.

## Key details

- **Per-basemap packs.** A pack embeds the basemap's style, so a region is tied to
  the basemap it was downloaded with; Settings shows which. Downloading the same
  area for satellite _and_ street = two packs.
- **Pack identity.** MapLibre keys packs by `name`; use a generated id as `name`
  and store `{ label, basemap }` in `metadata` (a JSON string).
- **minZoom** = `overviewZoomFor(bounds)`, **maxZoom** = 17.
- **Cap**: compute `tileCountForRegion` first; if > cap, block before starting.
  Also call `setTileCountLimit` high enough to allow legitimate downloads.

## Error handling

- Mid-download failure → MapLibre `onError` → mark the region as incomplete in the
  store; Settings offers **Resume** (`pack.resume()`) or **Delete**.
- Over-cap → blocked in `RegionSelectOverlay` with a shrink-the-box message.
- No connectivity when starting a download → surfaced as a download error.
- Toggling "locally downloaded only" ON then panning outside any region → blank
  tiles (intended); a subtle on-map hint notes you're in offline-only mode.

## Testing

- **Pure core** (`tileCountForRegion`, `estimateBytes`, `overviewZoomFor`) →
  co-located `*.test.ts`, including known bounds/zoom → known tile counts.
- **Wrapper, store, UI, actual downloads** → verified on-device/emulator (the
  native offline DB can't be unit-tested): download a small region, toggle
  airplane mode / "locally downloaded only", confirm the region renders offline
  and outside it is blank; delete frees space.

## Out of scope (v1)

- 3D-terrain offline (DEM + drape texture) — separate follow-up (needs persistent
  storage of our own tile fetches, currently in OS-evictable cache).
- PDF overlays (already offline).
- Auto-refresh / updating stale packs.
