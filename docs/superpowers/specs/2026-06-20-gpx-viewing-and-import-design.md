# GPX viewing & import — chronological design

**Date:** 2026-06-20
**Status:** awaiting approval
**Ships in:** next store build (vc42) — Phase 3 adds native intent filters, so the
whole set requires a rebuild (cannot be OTA'd).

## Goal

Three related improvements to how GPX trails are imported and viewed:

1. **Waypoints/notes from GPX show up when viewing a trail** (foundational).
2. **A 2D/3D toggle in the trail view** (today it is 3D-only).
3. **Open a `.gpx` file directly with Inukshuk** (Android file association +
   import-on-open).

Built in dependency order **Phase 1 → 2 → 3**: the note *data* must exist before
it can be displayed (Phase 1); the 2D/3D views both render that data (Phase 2);
opening a file then lands a trail whose notes already display (Phase 3).

## Shared decisions

- **GPX-only file association** (not PDF) — GPX is effectively unique to trail
  apps; registering PDF would put Inukshuk in every PDF's "Open with" menu.
- **Notes use the existing `TrackNote` model** (`{ id, distanceM, text,
  createdAt, photoUri? }`, anchored by distance along the trail). A GPX `<wpt>`
  becomes a `TrackNote` by snapping it to the nearest track point. No new data
  model; notes already render on the elevation profile and persist in the library
  index.
- **`src/core` stays pure** — all parsing/snapping/geometry is added there with
  co-located tests; rendering and platform glue go in `src/features`.

---

## Phase 1 — GPX waypoints/notes → shown in the trail view

**Problem:** `parseGpx` keeps only track points; `<wpt>` markers (name/desc) are
dropped (used only as a fallback when there are no track points). Opening or
importing a GPX with marked points loses them.

**Changes**

- **core/geo/gpx** — extend `parseGpx` to also return
  `waypoints: GpxWaypoint[]` (`{ latitude, longitude, name?, description?,
  symbol?, time? }`). Existing `points` / fallback behavior unchanged. *(unit
  tested)*
- **core/geo/track** — add `snapWaypointsToNotes(points, waypoints)`: for each
  waypoint, find the nearest track point and its cumulative distance, producing
  `{ distanceM, text }` (text = `name`, with `desc` appended when present).
  Waypoints farther than a threshold from the track are still included, snapped
  to the closest point. *(unit tested — the core of this phase)*
- **import flow** (`importGpx.ts` + `libraryStore`) — on import, convert parsed
  waypoints to notes and seed them on the new track (extend `addTrack` to accept
  optional initial notes, or apply them immediately after). Existing
  button-import and Phase-3 open-import share this path.
- **render** — in the trail view (Phase 2 covers both modes) draw a pin at each
  note's position (track point at `distanceM` → lat/lon). The elevation profile
  already shows notes, so that comes for free.

**Decision:** scope rendering to the **trail view** (2D + 3D). Showing the same
note pins on the *main* map is a natural follow-up but is out of scope for v1 to
keep this focused.

**Tested:** `parseGpx` waypoint extraction and `snapWaypointsToNotes` get
`*.test.ts` in core (including a GPX with both a track and `<wpt>`s, and a
waypoint off to the side). Rendering verified on-device.

---

## Phase 2 — 2D/3D toggle in the trail view

**Problem:** `app/trail3d/[id]` (`Trail3DGLScreen`) is 3D-only. Users want a 2D
map option.

**Changes**

- Add a `trailViewMode: '2d' | '3d'` setting in `settingsStore`, default `'3d'`
  (preserves current behavior), remembered across sessions.
- Add a **2D/3D segmented toggle** in the trail-view header.
- **2D view** — a MapLibre map showing the trail line (GeoJSON) + the Phase-1
  note pins, fit to the trail bounds, using the user's current basemap. Reuses
  the existing `Map` component and the main map's trail-overlay rendering rather
  than new map code.
- **3D view** — unchanged, plus it now also renders the Phase-1 note pins.
- The elevation profile + notes/photos section stays visible under both modes.

**Decision:** default stays **3D**; the toggle is remembered. The route name
`trail3d/[id]` stays as-is (internal only) to avoid churn.

**Tested:** mode-selection logic is trivial; verified on-device that the toggle
switches views, both render the trail + notes, and the choice persists.

---

## Phase 3 — Open a `.gpx` file with Inukshuk

**Problem:** GPX files downloaded on a phone often only offer "Open with…", with
no way to save-then-import.

**Changes**

- **Native association (requires rebuild):**
  - **Android** (`android.intentFilters`): `VIEW` + `DEFAULT`/`BROWSABLE`,
    matching GPX by MIME (`application/gpx+xml`, `application/xml`,
    `application/octet-stream`) **and** by path pattern `.*\\.gpx` for `file`/
    `content` URIs (file managers are inconsistent about GPX's MIME type).
  - **iOS** (`ios.infoPlist`): declare the `com.topografix.gpx` document type
    (conforms to `public.xml`) so Inukshuk appears in "Open in…". Added now so
    iOS is ready, even though iOS isn't being built yet.
- **Refactor:** extract the per-file logic in `importGpx.ts` into
  `importGpxFromUri(uri, fallbackName)`, shared by the Import button and the
  open-handler (with Phase 1, this also imports the GPX's notes).
- **Incoming-file hook** (`src/features/share/useIncomingFile.ts`, mounted in
  `app/_layout.tsx`): uses `expo-linking` (`getInitialURL` for cold start + a
  `url` listener for warm) to receive the URI; a **pure** helper decides
  "is this a GPX + what name?" (*unit tested*); then imports → adds to library →
  navigates to the Library tab → shows a root-level snackbar (or an error if the
  file has no track points).
- **Risk verified first:** opened files arrive as Android `content://` URIs (the
  picker only ever produced cached `file://`). Implementation step 1 is proving
  we can read a `content://` GPX (read as text via the File API; fall back if
  needed) — if that fails the feature fails, so it's verified on-device before
  the rest is built.

**Decision:** after an open-import, **land on the Library tab with a snackbar**
(trail appears at the top), rather than auto-opening the trail view — it is
consistent and avoids edge cases. Easy to change to "open the trail" later.

---

## Build & release

- Phases 1–2 are pure JS/RN (could even OTA); Phase 3 adds native intent filters.
- All three ship together in **vc42** (versionName 1.0.0, versionCode 42).
- `npm run check` (typecheck + lint + 168→more tests) must pass before building.

## Out of scope (v1)

- Note pins on the **main** map (only the trail view in v1).
- PDF file association (GPX only).
- Editing GPX-imported notes differs from app-created ones (they use the same
  model, so the existing editor works unchanged).
