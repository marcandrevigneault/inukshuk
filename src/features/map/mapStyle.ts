import type { StyleSpecification } from '@maplibre/maplibre-react-native';

/**
 * Open, key-free DEM tiles (Mapzen/AWS Terrain Tiles) used for hillshade relief
 * and 3D terrain. Terrarium-encoded PNGs; ~zoom 15 max.
 */
const TERRAIN_DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/**
 * A minimal MapLibre style that renders OpenStreetMap raster tiles as the base
 * layer. Raster (not vector) keeps us free of any API key or paid tile service.
 * The tile URL is injected from settings so the basemap can be swapped without
 * touching code.
 *
 * When `terrain3d` is on, a free Terrarium DEM source is added with a hillshade
 * relief layer and a `terrain` spec so the map can be pitched into a 3D relief
 * view (needs network for the DEM tiles).
 */
export function buildOsmStyle(tileUrl: string, terrain3d = false): StyleSpecification {
  const style: StyleSpecification = {
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

  if (terrain3d) {
    style.sources.dem = {
      type: 'raster-dem',
      tiles: [TERRAIN_DEM_URL],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Elevation © Mapzen / AWS Terrain Tiles',
    };
    style.layers.push({
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      paint: { 'hillshade-exaggeration': 0.55 },
    });
    style.terrain = { source: 'dem', exaggeration: 1.4 };
  }

  return style;
}
