import { snapWaypointsToNotes } from './snapWaypoints';
import type { TrackPoint } from '@core/models';
import type { GpxWaypoint } from '@core/geo/gpx';

const pts: TrackPoint[] = [
  { latitude: 46.8, longitude: -71.2, time: 0 },
  { latitude: 46.81, longitude: -71.2, time: 0 },
  { latitude: 46.82, longitude: -71.2, time: 0 },
];

it('anchors a waypoint to the nearest point by cumulative distance', () => {
  const wpts: GpxWaypoint[] = [{ latitude: 46.8101, longitude: -71.2001, name: 'Mid' }];
  const notes = snapWaypointsToNotes(pts, wpts);
  expect(notes).toHaveLength(1);
  expect(notes[0]!.text).toBe('Mid');
  // nearest is index 1; distance ~ first segment length (~1.1km), > 0
  expect(notes[0]!.distanceM).toBeGreaterThan(0);
});

it('combines name and description, sorts by distance, defaults empty label', () => {
  const wpts: GpxWaypoint[] = [
    { latitude: 46.82, longitude: -71.2, name: 'End', description: 'top' },
    { latitude: 46.8, longitude: -71.2 },
  ];
  const notes = snapWaypointsToNotes(pts, wpts);
  expect(notes.map((n) => n.text)).toEqual(['Waypoint', 'End — top']);
  expect(notes[0]!.distanceM).toBeLessThan(notes[1]!.distanceM);
});

it('returns [] when there are no points or no waypoints', () => {
  expect(snapWaypointsToNotes([], [{ latitude: 1, longitude: 1 }])).toEqual([]);
  expect(snapWaypointsToNotes(pts, [])).toEqual([]);
});
