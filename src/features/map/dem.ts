import { pickTerrainZoom, rangeBbox, terrariumToMeters, tileRangeForBbox } from '@core/geo/terrain';
import type { BoundingBox } from '@core/models';
import * as storage from '@data/storage';
import UPNG from 'upng-js';

const TILE = 256;
const demUrl = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

export interface Heightmap {
  /** Elevation in metres, row-major, `grid * grid`. Row 0 = north edge. */
  data: Float32Array;
  grid: number;
  /** Tile-aligned lng/lat bounds actually covered by the heightmap. */
  bbox: BoundingBox;
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
  const wide = range.maxX - range.minX + 1;
  const high = range.maxY - range.minY + 1;
  const fullW = wide * TILE;
  const fullH = high * TILE;
  const full = new Float32Array(fullW * fullH);

  const jobs: Promise<void>[] = [];
  for (let ty = range.minY; ty <= range.maxY; ty++) {
    for (let tx = range.minX; tx <= range.maxX; tx++) {
      const ox = (tx - range.minX) * TILE;
      const oy = (ty - range.minY) * TILE;
      jobs.push(
        (async () => {
          const bytes = await storage.downloadBytes(demUrl(z, tx, ty), `${z}-${tx}-${ty}.png`);
          const img = UPNG.decode(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          );
          const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]!);
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

  return { data, grid, bbox: rangeBbox(range), minH, maxH };
}
