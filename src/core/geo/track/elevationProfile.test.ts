import type { TrackPoint } from '@core/models';
import { haversineMeters } from '@core/geo/geomath';
import { buildElevationProfile } from './elevationProfile';

/** Build a point at a given longitude offset (eastward line) with altitude. */
const pt = (lngDeg: number, altitude?: number, time = 0): TrackPoint => ({
  latitude: 0,
  longitude: lngDeg,
  altitude,
  time,
});

describe('buildElevationProfile', () => {
  it('reports no elevation for an empty track', () => {
    const p = buildElevationProfile([]);
    expect(p.hasElevation).toBe(false);
    expect(p.samples).toHaveLength(0);
    expect(p.totalDistanceM).toBe(0);
  });

  it('reports no elevation when fewer than two points carry altitude', () => {
    expect(buildElevationProfile([pt(0), pt(0.001), pt(0.002)]).hasElevation).toBe(false);
    expect(buildElevationProfile([pt(0, 100), pt(0.001), pt(0.002)]).hasElevation).toBe(false);
  });

  it('still accumulates total distance even without usable altitude', () => {
    const p = buildElevationProfile([pt(0), pt(0.001)]);
    expect(p.hasElevation).toBe(false);
    // One ~111 m segment at the equator.
    expect(p.totalDistanceM).toBeCloseTo(haversineMeters(pt(0), pt(0.001)), 3);
  });

  it('produces the requested number of samples spanning the full distance', () => {
    const pts = [pt(0, 100), pt(0.001, 110), pt(0.002, 120), pt(0.003, 130)];
    const p = buildElevationProfile(pts, { samples: 10 });
    expect(p.hasElevation).toBe(true);
    expect(p.samples).toHaveLength(10);
    expect(p.samples[0]!.distanceM).toBe(0);
    expect(p.samples[9]!.distanceM).toBeCloseTo(p.totalDistanceM, 3);
    // Distances are monotonically non-decreasing.
    for (let i = 1; i < p.samples.length; i++) {
      expect(p.samples[i]!.distanceM).toBeGreaterThanOrEqual(p.samples[i - 1]!.distanceM);
    }
  });

  it('keeps the first and last elevations exact at the endpoints', () => {
    const pts = [pt(0, 200), pt(0.001, 250), pt(0.002, 230), pt(0.003, 290)];
    const p = buildElevationProfile(pts, { samples: 32 });
    expect(p.samples[0]!.elevationM).toBeCloseTo(200, 6);
    expect(p.samples[p.samples.length - 1]!.elevationM).toBeCloseTo(290, 6);
  });

  it('reports the true min and max from the raw series, not the resample', () => {
    const pts = [pt(0, 100), pt(0.001, 500), pt(0.002, 50), pt(0.003, 120)];
    const p = buildElevationProfile(pts);
    expect(p.minElevationM).toBe(50);
    expect(p.maxElevationM).toBe(500);
  });

  it('linearly interpolates between samples for a uniform climb', () => {
    // Altitude rises 10 m per equal-distance step; midpoint must sit halfway.
    const pts = [pt(0, 0), pt(0.001, 10), pt(0.002, 20), pt(0.003, 30), pt(0.004, 40)];
    const p = buildElevationProfile(pts, { samples: 5 });
    expect(p.samples.map((s) => Math.round(s.elevationM))).toEqual([0, 10, 20, 30, 40]);
  });

  it('places elevation against distance, skipping altitude-less points correctly', () => {
    // The middle point lacks altitude; the profile must interpolate across the
    // gap using the real distances of the altitude-bearing points.
    const pts = [pt(0, 100), pt(0.001), pt(0.002, 300)];
    const p = buildElevationProfile(pts, { samples: 3 });
    expect(p.hasElevation).toBe(true);
    expect(p.samples[0]!.elevationM).toBeCloseTo(100, 6);
    expect(p.samples[1]!.elevationM).toBeCloseTo(200, 6); // halfway in distance
    expect(p.samples[2]!.elevationM).toBeCloseTo(300, 6);
  });

  it('handles a flat track (min === max) without dividing by zero', () => {
    const pts = [pt(0, 75), pt(0.001, 75), pt(0.002, 75)];
    const p = buildElevationProfile(pts, { samples: 8 });
    expect(p.minElevationM).toBe(75);
    expect(p.maxElevationM).toBe(75);
    expect(p.samples.every((s) => s.elevationM === 75)).toBe(true);
  });

  it('never returns fewer than two samples even if asked for one', () => {
    const pts = [pt(0, 10), pt(0.001, 20)];
    expect(buildElevationProfile(pts, { samples: 1 }).samples).toHaveLength(2);
  });
});
