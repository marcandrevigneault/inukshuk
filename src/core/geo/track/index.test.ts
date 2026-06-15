import type { TrackPoint } from '@core/models';

import { computeTrackStats, elevationGainLoss, haversineMeters, reduceStatsWith } from './index';

const pt = (
  latitude: number,
  longitude: number,
  time: number,
  altitude?: number,
  extra?: Partial<TrackPoint>,
): TrackPoint => ({ latitude, longitude, time, altitude, ...extra });

describe('haversineMeters', () => {
  it('matches known city-pair distances within 0.5%', () => {
    // Paris -> London ~ 343.5 km
    const d1 = haversineMeters(
      { latitude: 48.8566, longitude: 2.3522 },
      { latitude: 51.5074, longitude: -0.1278 },
    );
    expect(Math.abs(d1 - 343_500) / 343_500).toBeLessThan(0.005);

    // New York -> Los Angeles ~ 3935.7 km
    const d2 = haversineMeters(
      { latitude: 40.7128, longitude: -74.006 },
      { latitude: 34.0522, longitude: -118.2437 },
    );
    expect(Math.abs(d2 - 3_935_700) / 3_935_700).toBeLessThan(0.005);
  });

  it('is zero for identical points', () => {
    expect(
      haversineMeters({ latitude: 45, longitude: -73 }, { latitude: 45, longitude: -73 }),
    ).toBe(0);
  });
});

describe('elevationGainLoss', () => {
  it('counts a monotonic climb', () => {
    const r = elevationGainLoss([100, 110, 120, 130]);
    expect(r.ascentM).toBeCloseTo(30, 6);
    expect(r.descentM).toBe(0);
  });

  it('counts a monotonic descent', () => {
    const r = elevationGainLoss([130, 120, 110, 100]);
    expect(r.descentM).toBeCloseTo(30, 6);
    expect(r.ascentM).toBe(0);
  });

  it('suppresses noise on a flat-but-noisy series', () => {
    // Jitter of +-2 m around 100, well under the 3 m default threshold.
    const noisy = [100, 102, 99, 101, 98, 100, 101, 99, 100, 102, 98];
    const r = elevationGainLoss(noisy);
    expect(r.ascentM).toBe(0);
    expect(r.descentM).toBe(0);
  });

  it('captures a real up-down profile', () => {
    // climb 100 -> 200, descend 200 -> 150
    const profile = [100, 130, 160, 200, 180, 150];
    const r = elevationGainLoss(profile);
    expect(r.ascentM).toBeCloseTo(100, 6);
    expect(r.descentM).toBeCloseTo(50, 6);
  });

  it('ignores undefined samples', () => {
    const r = elevationGainLoss([100, undefined, 110, undefined, 120]);
    expect(r.ascentM).toBeCloseTo(20, 6);
  });

  it('returns zero for all-undefined', () => {
    expect(elevationGainLoss([undefined, undefined])).toEqual({
      ascentM: 0,
      descentM: 0,
    });
  });
});

describe('computeTrackStats', () => {
  it('handles an empty array', () => {
    const s = computeTrackStats([]);
    expect(s.pointCount).toBe(0);
    expect(s.distanceM).toBe(0);
    expect(s.bbox).toBeUndefined();
    expect(s.minAltitudeM).toBeUndefined();
  });

  it('handles a single point', () => {
    const s = computeTrackStats([pt(45, -73, 1000, 50)]);
    expect(s.pointCount).toBe(1);
    expect(s.distanceM).toBe(0);
    expect(s.durationS).toBe(0);
    expect(s.bbox).toEqual({ minLat: 45, minLng: -73, maxLat: 45, maxLng: -73 });
    expect(s.minAltitudeM).toBe(50);
    expect(s.maxAltitudeM).toBe(50);
  });

  it('handles two points', () => {
    const a = pt(45, -73, 0, 100);
    const b = pt(45.001, -73, 60_000, 110);
    const s = computeTrackStats([a, b]);
    const expectedDist = haversineMeters(a, b);
    expect(s.distanceM).toBeCloseTo(expectedDist, 6);
    expect(s.durationS).toBe(60);
    expect(s.pointCount).toBe(2);
  });

  it('computes a synthetic hike with known distance/ascent/duration/movingTime', () => {
    // 4 points each ~111.1 m apart (0.001 deg lat), 60 s apart, +10 m each.
    const pts = [
      pt(45.0, -73, 0, 100),
      pt(45.001, -73, 60_000, 110),
      pt(45.002, -73, 120_000, 120),
      pt(45.003, -73, 180_000, 130),
    ];
    const s = computeTrackStats(pts);
    let expectedDist = 0;
    for (let i = 1; i < pts.length; i++) expectedDist += haversineMeters(pts[i - 1]!, pts[i]!);
    expect(s.distanceM).toBeCloseTo(expectedDist, 6);
    expect(s.ascentM).toBeCloseTo(30, 6);
    expect(s.descentM).toBe(0);
    expect(s.durationS).toBe(180);
    expect(s.movingTimeS).toBe(180); // ~1.85 m/s > 0.5 threshold
    expect(s.avgSpeedMps).toBeCloseTo(expectedDist / 180, 6);
    expect(s.maxSpeedMps).toBeGreaterThan(0);
    expect(s.minAltitudeM).toBe(100);
    expect(s.maxAltitudeM).toBe(130);
  });

  it('excludes a stationary gap from moving time', () => {
    const pts = [
      pt(45.0, -73, 0, 100),
      pt(45.001, -73, 60_000, 100), // moving
      pt(45.001, -73, 660_000, 100), // 10 min standing still, no displacement
      pt(45.002, -73, 720_000, 100), // moving again
    ];
    const s = computeTrackStats(pts);
    expect(s.durationS).toBe(720);
    expect(s.movingTimeS).toBe(120); // only the two 60 s moving segments
    expect(s.movingTimeS).toBeLessThan(s.durationS);
  });

  it('handles undefined altitudes (no ascent/descent, undefined min/max)', () => {
    const pts = [pt(45, -73, 0), pt(45.001, -73, 60_000)];
    const s = computeTrackStats(pts);
    expect(s.ascentM).toBe(0);
    expect(s.descentM).toBe(0);
    expect(s.minAltitudeM).toBeUndefined();
    expect(s.maxAltitudeM).toBeUndefined();
  });

  it('treats out-of-order / duplicate timestamps as dt<=0 (distance, not time)', () => {
    const a = pt(45.0, -73, 1000, 100);
    const b = pt(45.001, -73, 1000, 100); // same timestamp
    const s = computeTrackStats([a, b]);
    expect(s.distanceM).toBeGreaterThan(0);
    expect(s.movingTimeS).toBe(0);
    expect(s.maxSpeedMps).toBe(0);
    expect(s.avgSpeedMps).toBe(0);
  });

  it('drops points worse than maxAccuracyM', () => {
    const pts = [
      pt(45.0, -73, 0, 100, { accuracy: 5 }),
      pt(45.5, -73, 30_000, 100, { accuracy: 500 }), // garbage fix
      pt(45.001, -73, 60_000, 100, { accuracy: 8 }),
    ];
    const filtered = computeTrackStats(pts, { maxAccuracyM: 50 });
    const unfiltered = computeTrackStats(pts);
    expect(filtered.pointCount).toBe(2);
    expect(filtered.distanceM).toBeLessThan(unfiltered.distanceM);
  });
});

describe('reduceStatsWith', () => {
  it('matches computeTrackStats for distance/duration on a monotonic series', () => {
    const pts = [
      pt(45.0, -73, 0, 100),
      pt(45.001, -73, 60_000, 110),
      pt(45.002, -73, 120_000, 120),
      pt(45.003, -73, 180_000, 130),
    ];
    let stats = reduceStatsWith(
      {
        distanceM: 0,
        ascentM: 0,
        descentM: 0,
        durationS: 0,
        movingTimeS: 0,
        avgSpeedMps: 0,
        maxSpeedMps: 0,
        pointCount: 0,
      },
      undefined,
      pts[0]!,
    );
    for (let i = 1; i < pts.length; i++) {
      stats = reduceStatsWith(stats, pts[i - 1]!, pts[i]!);
    }
    const full = computeTrackStats(pts);
    expect(stats.distanceM).toBeCloseTo(full.distanceM, 6);
    expect(stats.durationS).toBeCloseTo(full.durationS, 6);
    expect(stats.movingTimeS).toBeCloseTo(full.movingTimeS, 6);
    expect(stats.pointCount).toBe(full.pointCount);
    // Each step is +10 m (>= 3 threshold) so per-step matches the full filter here.
    expect(stats.ascentM).toBeCloseTo(full.ascentM, 6);
  });

  it('initializes bbox and altitude from the first point', () => {
    const s = reduceStatsWith(
      {
        distanceM: 0,
        ascentM: 0,
        descentM: 0,
        durationS: 0,
        movingTimeS: 0,
        avgSpeedMps: 0,
        maxSpeedMps: 0,
        pointCount: 0,
      },
      undefined,
      pt(10, 20, 5000, 42),
    );
    expect(s.pointCount).toBe(1);
    expect(s.bbox).toEqual({ minLat: 10, minLng: 20, maxLat: 10, maxLng: 20 });
    expect(s.minAltitudeM).toBe(42);
  });
});
