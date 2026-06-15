# Architecture

## Layering

The guiding rule: **all the hard logic is pure and unit-tested; platform code is
a thin shell around it.**

- `src/core/**` — zero React Native / Expo imports. Pure functions and types.
  This is where georeferencing, GPX, and track math live, and where the test
  coverage gate is enforced (80% lines). Runs identically in Node (Jest) and on
  device.
- `src/data/**` — persistence via `expo-file-system`. The only place that
  touches the filesystem.
- `src/state/**` — Zustand stores. They orchestrate `core` + `data`; they hold
  no business math themselves.
- `src/features/**` — screens and hooks. Composition and platform APIs
  (location, sensors, WebView).
- `src/ui/**`, `src/lib/**` — theme, shared components, formatting.
- `app/**` — expo-router routes only; each file just renders a feature screen.

Path aliases (`@core`, `@data`, `@features`, `@state`, `@ui`, `@lib`, `@/`) are
declared once in `tsconfig.json` and mirrored in `jest.config.js`.

## The georeferenced-PDF pipeline

This is the most novel part. Getting a PDF onto the map at the right place takes
four stages:

1. **Parse georeferencing** (`core/geo/geopdf`, pure TS). On import we read the
   PDF bytes and extract whichever georeferencing is present:
   - Adobe ISO 32000 `/VP` → `/Measure /GEO` (GPTS in lat/lon, a GCS/EPSG/WKT),
   - OGC/TerraGo `/LGIDict` (registration control points + neatline), or
   - a sidecar world file / GDAL `.aux.xml`.
     The source CRS is reprojected to WGS84 with **proj4**. The result is a
     `GeoReference`: the map-frame rectangle in PDF points (`viewport.rect`) and
     its geographic corners (`viewport.corners`).

2. **Rasterize the page** (`features/map/PdfRasterizer`). A hidden offscreen
   WebView runs **bundled pdf.js** (no network) to render the page to a PNG data
   URI, and reports the page size in points. Requests are queued and chunked so
   multi-MB PDFs cross the bridge safely.

3. **Extrapolate full-page corners** (`core/geo/geomath`). The georeferencing
   often describes only the inner map frame, but we render the _whole_ page. We
   fit a 2D affine transform from the viewport's four (page-point → geographic)
   corner correspondences and evaluate it at the full page rectangle. This
   yields the geographic corners of the rendered image even with rotation/skew.

4. **Overlay** (`MapScreen`). The PNG goes into a MapLibre `ImageSource` at those
   four corners; OSM raster tiles render underneath, so anywhere the PDF doesn't
   cover is still mapped.

## Recording & track math

- A single `expo-location` watch drives both the live marker and the recorder.
  The recorder store ignores incoming fixes unless its status is `recording`.
- Live HUD stats use a cheap incremental fold (`reduceStatsWith`); the
  authoritative stats saved to GPX are recomputed over the full point list
  (`computeTrackStats`).
- **D+ / D-** uses hysteresis (default 3 m threshold) so GPS altitude noise on
  flat ground doesn't inflate elevation gain — the number hikers actually expect.
- Tracks persist as standard GPX 1.1 in the document directory; the library
  index (`library.json`) keeps lightweight summaries and loads points on demand.

## State & persistence

| Store           | Persisted?            | Holds                                        |
| --------------- | --------------------- | -------------------------------------------- |
| `libraryStore`  | yes (`library.json`)  | imported maps + track summaries + active map |
| `settingsStore` | yes (`settings.json`) | tile URL, keep-awake, point spacing          |
| `recorderStore` | no (transient)        | live recording state + points + stats        |
| `mapStore`      | no (transient)        | follow-me, overlay toggle, focused track     |

Stores hydrate from disk on app start in `app/_layout.tsx`.
