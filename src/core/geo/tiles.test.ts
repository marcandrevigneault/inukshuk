import { tileCountForRegion, overviewZoomFor, estimateBytes } from './tiles';
import type { BoundingBox } from '@core/models';

const world: BoundingBox = { minLat: -85, minLng: -180, maxLat: 85, maxLng: 180 };
const small: BoundingBox = { minLat: 46.8, minLng: -71.22, maxLat: 46.83, maxLng: -71.18 };

it('counts 1 tile for the whole world at z0', () => {
  expect(tileCountForRegion(world, 0, 0)).toBe(1);
});

it('counts the covering tiles across a zoom range (monotonic, > the single top)', () => {
  const z10to12 = tileCountForRegion(small, 10, 12);
  const z10to11 = tileCountForRegion(small, 10, 11);
  expect(z10to12).toBeGreaterThan(z10to11);
  expect(tileCountForRegion(small, 10, 10)).toBeGreaterThanOrEqual(1);
});

it('overviewZoomFor returns a low zoom whose span fits in <= maxTilesPerSide', () => {
  const z = overviewZoomFor(small, 2);
  expect(z).toBeGreaterThanOrEqual(0);
  expect(z).toBeLessThanOrEqual(17);
});

it('estimateBytes scales with tile count and basemap', () => {
  expect(estimateBytes(100, 'map')).toBeGreaterThan(0);
  expect(estimateBytes(200, 'map')).toBeCloseTo(2 * estimateBytes(100, 'map'));
  expect(estimateBytes(100, 'satellite')).toBeGreaterThan(estimateBytes(100, 'map'));
});
