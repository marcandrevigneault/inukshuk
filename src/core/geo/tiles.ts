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

/** Tile span of a bbox per axis at a single zoom: [xCount, yCount]. */
export function tileSpanAtZoom(b: BoundingBox, z: number): [number, number] {
  const maxTile = 2 ** z - 1;
  const x0 = Math.max(0, Math.min(maxTile, lngToX(b.minLng, z)));
  const x1 = Math.max(0, Math.min(maxTile, lngToX(b.maxLng, z)));
  const y0 = latToY(b.maxLat, z); // north = smaller y
  const y1 = latToY(b.minLat, z);
  return [Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1];
}

/** Tiles a bbox spans at a single zoom: (xCount) * (yCount). */
function tilesAtZoom(b: BoundingBox, z: number): number {
  const [xSpan, ySpan] = tileSpanAtZoom(b, z);
  return xSpan * ySpan;
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
    const [xSpan, ySpan] = tileSpanAtZoom(b, z);
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
