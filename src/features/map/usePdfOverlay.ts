import type { BoundingBox, GeoReference, LngLat, MapDocument } from '@core/models';
import {
  bboxFromCorners,
  cornersAreValid,
  extrapolatePageCorners,
  isDegenerateBBox,
} from '@core/geo/geomath';
import * as storage from '@data/storage';
import { useEffect, useState } from 'react';
import { usePdfRasterizer } from './PdfRasterizer';

export interface PdfOverlay {
  /** Stable id `${docId}:${pageIndex}`, also used as the MapLibre source id. */
  id: string;
  pngDataUri: string;
  /** MapLibre ImageSource ordering: top-left, top-right, bottom-right, bottom-left. */
  coordinates: [LngLat, LngLat, LngLat, LngLat];
  bbox: BoundingBox;
}

export interface PdfOverlaysState {
  overlays: PdfOverlay[];
  loading: boolean;
  error: string | null;
}

interface Target {
  docId: string;
  fileUri: string;
  geo: GeoReference;
}

/** Collect every active, georeferenced page across all imported maps. */
function activeTargets(maps: MapDocument[]): Target[] {
  const targets: Target[] = [];
  for (const m of maps) {
    if (!m.fileUri) continue;
    for (const pageIndex of m.activePages) {
      const geo = m.georeferences.find((g) => g.pageIndex === pageIndex);
      if (geo) targets.push({ docId: m.id, fileUri: m.fileUri, geo });
    }
  }
  return targets;
}

/**
 * Rasterize every active georeferenced page across all maps and compute each
 * page's full-page geographic corners (the rasterizer renders the whole page;
 * georeferencing may only describe the inner map frame — we extrapolate affinely
 * from the viewport corners). Pages whose corners are non-finite, out of range,
 * or degenerate are skipped (never handed to MapLibre) so a bad georeference can
 * never crash the native layer.
 */
export function usePdfOverlays(maps: MapDocument[]): PdfOverlaysState {
  const rasterize = usePdfRasterizer();
  const [state, setState] = useState<PdfOverlaysState>({
    overlays: [],
    loading: false,
    error: null,
  });

  const targets = activeTargets(maps);
  // A stable key over the active set; the effect re-runs only when it changes.
  const key = targets.map((t) => `${t.docId}:${t.geo.pageIndex}`).join('|');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (targets.length === 0) {
        if (!cancelled) setState({ overlays: [], loading: false, error: null });
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));

      const overlays: PdfOverlay[] = [];
      let firstError: string | null = null;

      for (const t of targets) {
        try {
          const { geo } = t;
          const pageRect = { x0: 0, y0: 0, x1: geo.pageWidthPt, y1: geo.pageHeightPt };
          const corners = extrapolatePageCorners(geo.viewport.rect, geo.viewport.corners, pageRect);
          const bbox = bboxFromCorners(corners);
          if (!cornersAreValid(corners) || isDegenerateBBox(bbox)) {
            firstError ??= `Page ${geo.pageIndex + 1} has invalid georeferencing — skipped`;
            continue;
          }
          const base64 = await storage.readFileBase64(t.fileUri);
          const raster = await rasterize({ base64, pageIndex: geo.pageIndex });
          if (cancelled) return;
          overlays.push({
            id: `${t.docId}:${geo.pageIndex}`,
            pngDataUri: raster.pngDataUri,
            coordinates: [
              corners.topLeft,
              corners.topRight,
              corners.bottomRight,
              corners.bottomLeft,
            ],
            bbox,
          });
        } catch (err) {
          if (cancelled) return;
          firstError ??= err instanceof Error ? err.message : 'Failed to render a PDF page';
        }
      }

      if (!cancelled) setState({ overlays, loading: false, error: firstError });
    })();

    return () => {
      cancelled = true;
    };
    // rasterize identity is stable from the provider; `key` captures the targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
