import type { Track, TrackPoint, TrackStats } from '@core/models';
import { buildGpx } from '@core/geo/gpx';
import { computeTrackStats, reduceStatsWith } from '@core/geo/track';
import * as storage from '@data/storage';
import { create } from 'zustand';
import { useLibraryStore } from './libraryStore';

const EMPTY_STATS: TrackStats = {
  distanceM: 0,
  ascentM: 0,
  descentM: 0,
  durationS: 0,
  movingTimeS: 0,
  avgSpeedMps: 0,
  maxSpeedMps: 0,
  pointCount: 0,
};

export type RecorderStatus = 'idle' | 'recording' | 'paused';

/** A waypoint dropped live during recording — materialized as a trail note on stop. */
interface PendingWaypoint {
  distanceM: number;
  label: string;
}

interface RecorderState {
  status: RecorderStatus;
  name: string;
  startedAt: number | null;
  points: TrackPoint[];
  stats: TrackStats;
  waypoints: PendingWaypoint[];

  start: (name?: string) => void;
  addPoint: (point: TrackPoint) => void;
  /** Drop a waypoint at the current distance (becomes a numbered note on stop). */
  addWaypoint: () => number;
  pause: () => void;
  resume: () => void;
  /** Finalize: compute authoritative stats, persist GPX, index it, reset. */
  stop: () => Promise<Track | null>;
  discard: () => void;
}

function defaultName(now: number): string {
  const d = new Date(now);
  return `Trail ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d
    .toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    .replace(/\s/g, '')}`;
}

export const useRecorderStore = create<RecorderState>((set, get) => ({
  status: 'idle',
  name: '',
  startedAt: null,
  points: [],
  stats: EMPTY_STATS,
  waypoints: [],

  start: (name) => {
    const now = Date.now();
    set({
      status: 'recording',
      name: name?.trim() || defaultName(now),
      startedAt: now,
      points: [],
      stats: EMPTY_STATS,
      waypoints: [],
    });
  },

  addPoint: (point) => {
    const { status, points, stats } = get();
    if (status !== 'recording') return;
    const prev = points[points.length - 1];
    set({
      points: [...points, point],
      // Live HUD uses the cheap incremental fold; final stats are recomputed
      // exactly on stop().
      stats: reduceStatsWith(stats, prev, point),
    });
  },

  addWaypoint: () => {
    const { status, stats, waypoints } = get();
    if (status !== 'recording') return 0;
    const n = waypoints.length + 1;
    set({ waypoints: [...waypoints, { distanceM: stats.distanceM, label: `Waypoint ${n}` }] });
    return n;
  },

  pause: () => {
    if (get().status === 'recording') set({ status: 'paused' });
  },

  resume: () => {
    if (get().status === 'paused') set({ status: 'recording' });
  },

  stop: async () => {
    const { points, name, startedAt, status, waypoints } = get();
    if (status === 'idle' || startedAt === null) return null;

    const endedAt = Date.now();
    const finalStats = computeTrackStats(points);
    const track: Track = {
      id: storage.newId(),
      name,
      startedAt,
      endedAt,
      status: 'finished',
      points,
      stats: finalStats,
    };

    if (points.length > 0) {
      const gpx = buildGpx({
        points,
        metadata: { name, time: startedAt, creator: 'Inukshuk' },
      });
      const fileUri = storage.writeTrackGpx(track.id, gpx);
      const lib = useLibraryStore.getState();
      lib.addTrack(track, fileUri);
      // Materialize live waypoints as numbered notes on the saved trail, clamped
      // to the final track length.
      for (const wp of waypoints) {
        lib.addTrackNote(track.id, Math.min(wp.distanceM, finalStats.distanceM), wp.label);
      }
    }

    set({
      status: 'idle',
      name: '',
      startedAt: null,
      points: [],
      stats: EMPTY_STATS,
      waypoints: [],
    });
    return track;
  },

  discard: () => {
    set({
      status: 'idle',
      name: '',
      startedAt: null,
      points: [],
      stats: EMPTY_STATS,
      waypoints: [],
    });
  },
}));
