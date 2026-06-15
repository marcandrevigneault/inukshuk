import type { BoundingBox, LngLat, TrackPoint } from '@core/models';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import type { Feature, LineString } from 'geojson';

/** Build a GeoJSON LineString feature from recorded points (drops <2 points). */
export function toLineFeature(points: readonly TrackPoint[]): Feature<LineString> | null {
  if (points.length < 2) return null;
  const coordinates: LngLat[] = points.map((p) => [p.longitude, p.latitude]);
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: {},
  };
}

/** Convert our WGS84 bbox to MapLibre's [west, south, east, north] bounds. */
export function toLngLatBounds(b: BoundingBox): LngLatBounds {
  return [b.minLng, b.minLat, b.maxLng, b.maxLat];
}
