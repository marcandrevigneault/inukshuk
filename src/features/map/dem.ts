import {
  pickTerrainZoom,
  rangeBbox,
  terrariumToMeters,
  tileRangeForBbox,
  type TileRange,
} from '@core/geo/terrain';
import type { BoundingBox } from '@core/models';
import * as storage from '@data/storage';
import jpeg from 'jpeg-js';
import UPNG from 'upng-js';

const TILE = 256;
const UA = { 'User-Agent': 'Inukshuk/1.0 (offline trail navigation app)' };

const demUrl = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/** Free, key-free basemaps drapeable on the 3D terrain. */
export type Basemap = 'map' | 'satellite';
const basemapUrl = (source: Basemap, z: number, x: number, y: number) =>
  source === 'satellite'
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** Decode a tile (PNG or JPEG, by magic bytes) to RGBA. */
function decodeTileRGBA(bytes: Uint8Array): Uint8Array {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return jpeg.decode(bytes, { useTArray: true }).data;
  }
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Uint8Array(UPNG.toRGBA8(UPNG.decode(buf))[0]!);
}

export interface Heightmap {
  /** Elevation in metres, row-major, `grid * grid`. Row 0 = north edge. */
  data: Float32Array;
  grid: number;
  /** Tile-aligned lng/lat bounds actually covered by the heightmap. */
  bbox: BoundingBox;
  /** Tile range covered (so a basemap drape can fetch the same tiles). */
  range: TileRange;
  minH: number;
  maxH: number;
}

/**
 * Fetch the free Terrarium DEM tiles covering `bounds`, decode their elevation,
 * and downsample to a `grid × grid` heightmap for a 3D mesh. Network-bound.
 */
export async function fetchHeightmap(bounds: BoundingBox, grid = 192): Promise<Heightmap> {
  const z = pickTerrainZoom(bounds, 4);
  const range = tileRangeForBbox(bounds, z);
  const fullW = (range.maxX - range.minX + 1) * TILE;
  const fullH = (range.maxY - range.minY + 1) * TILE;
  const full = new Float32Array(fullW * fullH);

  const jobs: Promise<void>[] = [];
  for (let ty = range.minY; ty <= range.maxY; ty++) {
    for (let tx = range.minX; tx <= range.maxX; tx++) {
      const ox = (tx - range.minX) * TILE;
      const oy = (ty - range.minY) * TILE;
      jobs.push(
        (async () => {
          const rgba = decodeTileRGBA(
            await storage.downloadBytes(demUrl(z, tx, ty), `dem-${z}-${tx}-${ty}.png`),
          );
          for (let y = 0; y < TILE; y++) {
            for (let x = 0; x < TILE; x++) {
              const i = (y * TILE + x) * 4;
              full[(oy + y) * fullW + (ox + x)] = terrariumToMeters(
                rgba[i]!,
                rgba[i + 1]!,
                rgba[i + 2]!,
              );
            }
          }
        })(),
      );
    }
  }
  await Promise.all(jobs);

  const data = new Float32Array(grid * grid);
  let minH = Infinity;
  let maxH = -Infinity;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const sx = Math.min(fullW - 1, Math.round((gx / (grid - 1)) * (fullW - 1)));
      const sy = Math.min(fullH - 1, Math.round((gy / (grid - 1)) * (fullH - 1)));
      const h = full[sy * fullW + sx]!;
      data[gy * grid + gx] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  return { data, grid, bbox: rangeBbox(range), range, minH, maxH };
}

export interface BasemapTexture {
  data: Uint8Array;
  width: number;
  height: number;
}

/**
 * Fetch the basemap (OSM map or free Esri satellite) tiles for the same tile
 * range as the heightmap and stitch them into one RGBA texture to drape on the
 * terrain. Row 0 = north, matching the mesh UVs.
 */
export async function fetchBasemapTexture(
  range: TileRange,
  source: Basemap,
): Promise<BasemapTexture> {
  const fullW = (range.maxX - range.minX + 1) * TILE;
  const fullH = (range.maxY - range.minY + 1) * TILE;
  const out = new Uint8Array(fullW * fullH * 4);

  const jobs: Promise<void>[] = [];
  for (let ty = range.minY; ty <= range.maxY; ty++) {
    for (let tx = range.minX; tx <= range.maxX; tx++) {
      const ox = (tx - range.minX) * TILE;
      const oy = (ty - range.minY) * TILE;
      jobs.push(
        (async () => {
          const ext = source === 'satellite' ? 'jpg' : 'png';
          const rgba = decodeTileRGBA(
            await storage.downloadBytes(
              basemapUrl(source, range.z, tx, ty),
              `${source}-${range.z}-${tx}-${ty}.${ext}`,
              UA,
            ),
          );
          for (let y = 0; y < TILE; y++) {
            for (let x = 0; x < TILE; x++) {
              const si = (y * TILE + x) * 4;
              const di = ((oy + y) * fullW + (ox + x)) * 4;
              out[di] = rgba[si]!;
              out[di + 1] = rgba[si + 1]!;
              out[di + 2] = rgba[si + 2]!;
              out[di + 3] = 255;
            }
          }
        })(),
      );
    }
  }
  await Promise.all(jobs);
  return { data: out, width: fullW, height: fullH };
}
