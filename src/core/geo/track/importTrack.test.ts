import type { TrackPoint } from '@core/models';
import { buildImportedTrack } from './importTrack';

const pt = (latitude: number, longitude: number, time: number, altitude?: number): TrackPoint => ({
  latitude,
  longitude,
  time,
  altitude,
});

describe('buildImportedTrack', () => {
  it('derives start/end from point timestamps and computes stats', () => {
    const points = [pt(45.0, -73.0, 1000), pt(45.001, -73.0, 2000), pt(45.002, -73.0, 3000)];
    const t = buildImportedTrack({
      id: 'abc',
      points,
      name: 'Morning loop',
      fallbackName: 'file',
      fallbackTime: 9999,
    });
    expect(t.id).toBe('abc');
    expect(t.name).toBe('Morning loop');
    expect(t.status).toBe('finished');
    expect(t.startedAt).toBe(1000);
    expect(t.endedAt).toBe(3000);
    expect(t.points).toHaveLength(3);
    expect(t.stats.distanceM).toBeGreaterThan(0);
    expect(t.stats.pointCount).toBe(3);
  });

  it('falls back to the file name when GPX has no/blank name', () => {
    const t = buildImportedTrack({
      id: 'x',
      points: [pt(0, 0, 100)],
      name: '   ',
      fallbackName: 'hike-2026',
      fallbackTime: 42,
    });
    expect(t.name).toBe('hike-2026');
  });

  it('uses fallbackTime when the GPX carries no timestamps', () => {
    const t = buildImportedTrack({
      id: 'x',
      points: [pt(45, -73, 0), pt(45.001, -73, 0)],
      fallbackName: 'trail',
      fallbackTime: 1750000000000,
    });
    expect(t.startedAt).toBe(1750000000000);
    expect(t.endedAt).toBeUndefined();
  });
});
