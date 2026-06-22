import { tileCountForRegion, overviewZoomFor, estimateBytes, tileSpanAtZoom } from './tiles';
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

it('overviewZoomFor returns the highest zoom whose per-axis span still fits maxTilesPerSide', () => {
  const maxPerSide = 2;
  const z = overviewZoomFor(small, maxPerSide);
  expect(z).toBeGreaterThanOrEqual(0);
  expect(z).toBeLessThanOrEqual(17);

  // The returned zoom's span actually fits within the budget on both axes.
  const [xSpan, ySpan] = tileSpanAtZoom(small, z);
  expect(xSpan).toBeLessThanOrEqual(maxPerSide);
  expect(ySpan).toBeLessThanOrEqual(maxPerSide);

  // And it is the *highest* such zoom: one step deeper must exceed the budget
  // (unless we're already clamped at the max zoom of 17).
  if (z < 17) {
    const [xNext, yNext] = tileSpanAtZoom(small, z + 1);
    expect(Math.max(xNext, yNext)).toBeGreaterThan(maxPerSide);
  }
});

it('estimateBytes scales with tile count and basemap', () => {
  expect(estimateBytes(100, 'map')).toBeGreaterThan(0);
  expect(estimateBytes(200, 'map')).toBeCloseTo(2 * estimateBytes(100, 'map'));
  expect(estimateBytes(100, 'satellite')).toBeGreaterThan(estimateBytes(100, 'map'));
});
