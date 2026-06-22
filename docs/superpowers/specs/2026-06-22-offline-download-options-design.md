# Offline download options — quality + multi-basemap + live preview

**Date:** 2026-06-22
**Status:** approved (extends the shipped offline-region-download feature)

## Goal

When downloading an offline region, let the user (1) pick **which basemap(s)** to
download — Map / Satellite / Relief — via checkboxes, (2) pick a **quality**
(detail / max zoom), and (3) **see a live preview** of the exact drawn box in each
basemap style before committing. Keep the UI **compact** so the drawn box stays
visible on the map above.

## Current behaviour (baseline)

The region-select overlay's thin bottom bar downloads **only the active basemap**
at a fixed **maxZoom 17**, one pack. `createRegionPack` already embeds the basemap
in pack metadata, so multiple packs per region are already supported in the data
layer — this feature is about the **selection UI + multi-pack orchestration +
estimate**.

## Design

### Compact download sheet

Replace the thin Confirm bar with a compact bottom sheet (~⅓ screen height) shown
after the box is drawn. The box and map remain visible above it.

```
Download offline area
[map] ☑ Map    [sat] ☐ Satellite   [rlf] ☐ Relief     ← horizontal previews + checkboxes + per-layer size
Quality   ( Standard · ●High · Max )
≈ 70 tiles · 1 MB                    [ Cancel ] [ Download ]
```

- **Layer checkboxes**, horizontal: the currently-active basemap is pre-checked.
  At least one must stay checked (Download disabled if none).
- **Quality** segmented control → max zoom: **Standard z15 · High z16 · Max z17**,
  default **High**. Min/overview zoom stays auto (`overviewZoomFor`).
- **Total estimate**: summed across checked layers at the chosen quality, using the
  per-basemap bytes/tile constant. Enforces the existing tile cap — over the cap
  disables Download with "shrink the box or lower the quality".

### Live preview

Each layer's thumbnail is a small, non-interactive preview of the **exact drawn
box** rendered in that basemap's style. Primary approach: a tiny MapLibre `<Map>`
fit to the box bounds with `buildOsmStyle(tileUrl, false, basemap)`, non-interactive,
rendered only while the sheet is open. Needs network at that moment (the user is
online when downloading).

**Fallback** (decided on-device if 3 live mini-maps are too heavy / unstable):
fetch the **center tile** of the box at an appropriate zoom from each basemap's
tile URL and show it as an `Image` — same visual intent, much lighter. The choice
is an implementation detail verified on the emulator; the UI contract is identical.

### Multi-pack download

On Download, create one pack **per checked basemap**, sequentially (the loopback
style server is a singleton — one download at a time). Progress shows combined
state, e.g. `Downloading Satellite (2/3)… 40%`. Each pack is tagged by basemap
(existing metadata), so Settings already lists them distinctly.

## Components touched

- `src/core/geo/tiles.ts` — estimate helpers already take `minZoom/maxZoom` and a
  basemap; add a small pure helper to sum bytes across multiple basemaps at a given
  maxZoom (pure, unit-tested).
- `src/features/map/RegionSelectOverlay.tsx` — replace the thin bar with the compact
  sheet: layer checkboxes + previews, quality control, summed estimate, cap.
- New `src/features/map/RegionPreviewThumb.tsx` — the per-basemap live preview
  (mini map, with the center-tile fallback).
- `src/state/offlineStore.ts` — a `downloadMany` action (or extend `download`) that
  loops the checked basemaps sequentially with combined progress.
- `src/features/map/MapScreen.tsx` — pass the active basemap + tileUrl; wire the new
  onConfirm `(bounds, basemaps[], quality)`.

## Quality / defaults (my judgement, per "trust your judgement")

- Quality→zoom: Standard 15, High 16, Max 17. Default High.
- Default checked layer: the active basemap only.
- Sheet height kept ≤ ~⅓ screen; previews small (~72px) and horizontal.

## Testing

- Pure estimate math (multi-basemap sum, per-quality zoom) → co-located tests.
- UI + live preview + multi-pack download → verified on emulator: previews render
  the real area per style, quality changes the size, checking 2–3 layers downloads
  that many packs (combined progress), Settings lists each, cap blocks oversized.

## Out of scope

- Per-basemap independent quality (one quality applies to all checked layers).
- 3D/DEM offline (separate follow-up).
