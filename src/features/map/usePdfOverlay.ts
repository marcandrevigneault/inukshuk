import type { BoundingBox, LngLat, MapDocument } from '@core/models';
import { bboxFromCorners, extrapolatePageCorners } from '@core/geo/geomath';
import * as storage from '@data/storage';
import { useEffect, useState } from 'react';
import { usePdfRasterizer } from './PdfRasterizer';

export interface PdfOverlay {
  pngDataUri: string;
  /** MapLibre ImageSource ordering: top-left, top-right, bottom-right, bottom-left. */
  coordinates: [LngLat, LngLat, LngLat, LngLat];
  bbox: BoundingBox;
}

export interface PdfOverlayState {
  overlay: PdfOverlay | null;
  loading: boolean;
  error: string | null;
}

/**
 * Rasterizes the active georeferenced PDF page and computes the geographic
 * corners of the *full* rendered page (the rasterizer renders the whole page,
 * while georeferencing may only describe the inner map frame — we extrapolate
 * affinely from the viewport corners).
 */
export function usePdfOverlay(doc: MapDocument | null): PdfOverlayState {
  const rasterize = usePdfRasterizer();
  const [state, setState] = useState<PdfOverlayState>({
    overlay: null,
    loading: false,
    error: null,
  });

  const geo = doc?.georeference ?? null;
  const fileUri = doc?.fileUri ?? null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!doc || !geo || !fileUri) {
        if (!cancelled) setState({ overlay: null, loading: false, error: null });
        return;
      }
      setState({ overlay: null, loading: true, error: null });
      try {
        const base64 = await storage.readFileBase64(fileUri);
        const raster = await rasterize({ base64, pageIndex: geo.pageIndex });
        if (cancelled) return;

        const pageRect = { x0: 0, y0: 0, x1: geo.pageWidthPt, y1: geo.pageHeightPt };
        const corners = extrapolatePageCorners(geo.viewport.rect, geo.viewport.corners, pageRect);
        setState({
          overlay: {
            pngDataUri: raster.pngDataUri,
            coordinates: [
              corners.topLeft,
              corners.topRight,
              corners.bottomRight,
              corners.bottomLeft,
            ],
            bbox: bboxFromCorners(corners),
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          overlay: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to render PDF',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // rasterize identity is stable from the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, geo, fileUri]);

  return state;
}
