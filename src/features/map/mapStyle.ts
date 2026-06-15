import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * A minimal MapLibre style that renders OpenStreetMap raster tiles as the base
 * layer. Raster (not vector) keeps us free of any API key or paid tile service.
 * The tile URL is injected from settings so the basemap can be swapped without
 * touching code.
 */
export function buildOsmStyle(tileUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#E9E5DC' } },
      { id: 'osm', type: 'raster', source: 'osm' },
    ],
  };
}
