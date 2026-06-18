import type { BoundingBox } from '@core/models';

import {
  lngLatToTile,
  pickTerrainZoom,
  rangeBbox,
  sampleGridBilinear,
  terrariumToMeters,
  tileCount,
  tileRangeForBbox,
  tileToLngLat,
} from './terrain';

describe('lngLatToTile', () => {
  it('maps the world centre to the middle of the single z=0 tile', () => {
    expect(lngLatToTile(0, 0, 0)).toEqual({ x: 0.5, y: 0.5 });
  });
  it('maps the NW extreme to the origin tile', () => {
    const t = lngLatToTile(-180, 85.0511, 2);
    expect(Math.floor(t.x)).toBe(0);
    expect(Math.floor(t.y)).toBe(0);
  });
});

describe('terrariumToMeters', () => {
  it('decodes the zero-elevation reference', () => {
    expect(terrariumToMeters(128, 0, 0)).toBe(0);
  });
  it('decodes a positive elevation', () => {
    expect(terrariumToMeters(129, 0, 0)).toBe(256); // +1 in the high byte = +256 m
    expect(terrariumToMeters(128, 100, 0)).toBe(100);
  });
});

describe('tileToLngLat', () => {
  it('inverts lngLatToTile', () => {
    const z = 12;
    const t = lngLatToTile(-71.31, 46.81, z);
    const back = tileToLngLat(t.x, t.y, z);
    expect(back.lng).toBeCloseTo(-71.31, 4);
    expect(back.lat).toBeCloseTo(46.81, 4);
  });
  it('rangeBbox contains the source bbox', () => {
    const bbox = { minLat: 46.8, minLng: -71.32, maxLat: 46.82, maxLng: -71.3 };
    const cov = rangeBbox(tileRangeForBbox(bbox, 13));
    expect(cov.minLng).toBeLessThanOrEqual(bbox.minLng);
    expect(cov.maxLng).toBeGreaterThanOrEqual(bbox.maxLng);
    expect(cov.minLat).toBeLessThanOrEqual(bbox.minLat);
    expect(cov.maxLat).toBeGreaterThanOrEqual(bbox.maxLat);
  });
});

describe('sampleGridBilinear', () => {
  const grid = [0, 10, 20, 30]; // 2x2: rows [0,10] / [20,30]
  it('returns corner values exactly', () => {
    expect(sampleGridBilinear(grid, 2, 2, 0, 0)).toBe(0);
    expect(sampleGridBilinear(grid, 2, 2, 1, 0)).toBe(10);
    expect(sampleGridBilinear(grid, 2, 2, 1, 1)).toBe(30);
  });
  it('interpolates the centre', () => {
    expect(sampleGridBilinear(grid, 2, 2, 0.5, 0.5)).toBe(15);
  });
});

describe('tileRangeForBbox / pickTerrainZoom', () => {
  const bbox: BoundingBox = { minLat: 46.8, minLng: -71.32, maxLat: 46.82, maxLng: -71.3 };

  it('returns an inclusive range that contains the corners', () => {
    const r = tileRangeForBbox(bbox, 13);
    expect(r.minX).toBeLessThanOrEqual(r.maxX);
    expect(r.minY).toBeLessThanOrEqual(r.maxY);
  });

  it('keeps a small bbox within the tile budget and prefers detail', () => {
    const z = pickTerrainZoom(bbox, 4);
    const c = tileCount(tileRangeForBbox(bbox, z));
    expect(c.wide).toBeLessThanOrEqual(4);
    expect(c.high).toBeLessThanOrEqual(4);
    expect(z).toBeGreaterThanOrEqual(12); // a ~2 km bbox should still get high zoom
  });

  it('drops zoom for a large bbox to respect the budget', () => {
    const big: BoundingBox = { minLat: 45, minLng: -73, maxLat: 47, maxLng: -71 };
    const z = pickTerrainZoom(big, 4);
    const c = tileCount(tileRangeForBbox(big, z));
    expect(c.wide).toBeLessThanOrEqual(4);
    expect(c.high).toBeLessThanOrEqual(4);
  });
});
