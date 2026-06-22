import { withDemElevations, type DemGrid } from './demElevations';
import type { TrackPoint } from '@core/models';

// A 2×2 DEM over a unit box: north row (y=0) = [100, 200], south row = [300, 400].
const dem: DemGrid = {
  data: [100, 200, 300, 400],
  grid: 2,
  bbox: { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 },
};

it('samples the DEM height under each point (NW corner = north-west cell)', () => {
  const pts: TrackPoint[] = [{ latitude: 1, longitude: 0, time: 0 }]; // top-left
  expect(withDemElevations(pts, dem)[0]!.altitude).toBeCloseTo(100);
});

it('samples the SE corner', () => {
  const pts: TrackPoint[] = [{ latitude: 0, longitude: 1, time: 0 }]; // bottom-right
  expect(withDemElevations(pts, dem)[0]!.altitude).toBeCloseTo(400);
});

it('bilinearly interpolates the centre', () => {
  const pts: TrackPoint[] = [{ latitude: 0.5, longitude: 0.5, time: 0 }];
  // mean of the four corners
  expect(withDemElevations(pts, dem)[0]!.altitude).toBeCloseTo(250);
});

it('overwrites a recorded altitude and preserves other fields', () => {
  const pts: TrackPoint[] = [{ latitude: 1, longitude: 1, time: 42, altitude: 9999, speed: 3 }];
  const out = withDemElevations(pts, dem)[0]!;
  expect(out.altitude).toBeCloseTo(200); // NE corner, not the recorded 9999
  expect(out.time).toBe(42);
  expect(out.speed).toBe(3);
});
