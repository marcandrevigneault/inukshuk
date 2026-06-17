import type { BoundingBox } from './geo';

/** A single recorded GPS fix. */
export interface TrackPoint {
  latitude: number;
  longitude: number;
  /** Metres above the WGS84 ellipsoid / MSL as reported by GPS, if available. */
  altitude?: number;
  /** Epoch milliseconds of the fix. */
  time: number;
  /** Horizontal accuracy radius in metres, if available. */
  accuracy?: number;
  /** Vertical accuracy in metres, if available. */
  altitudeAccuracy?: number;
  /** Instantaneous ground speed in m/s reported by GPS, if available. */
  speed?: number;
}

/** Derived statistics for a sequence of {@link TrackPoint}s. */
export interface TrackStats {
  /** Total horizontal (haversine) distance in metres. */
  distanceM: number;
  /** Cumulative elevation gain, "D+", in metres. */
  ascentM: number;
  /** Cumulative elevation loss, "D-", in metres (positive number). */
  descentM: number;
  /** Wall-clock duration from first to last point, in seconds. */
  durationS: number;
  /** Duration excluding stationary periods, in seconds. */
  movingTimeS: number;
  /** Average moving speed (distance / movingTime) in m/s. */
  avgSpeedMps: number;
  /** Peak smoothed speed in m/s. */
  maxSpeedMps: number;
  minAltitudeM?: number;
  maxAltitudeM?: number;
  bbox?: BoundingBox;
  pointCount: number;
}

export type TrackStatus = 'recording' | 'paused' | 'finished';

/** A recorded route, persisted as GPX. */
export interface Track {
  id: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  status: TrackStatus;
  points: TrackPoint[];
  stats: TrackStats;
}

/**
 * Lightweight track record kept in the library index. The full point list lives
 * in the GPX file at `fileUri` and is loaded on demand.
 */
export interface TrackSummary {
  id: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  stats: TrackStats;
  fileUri: string;
  /** Id of the {@link Folder} this trail is organized under; undefined = Ungrouped. */
  folderId?: string;
}
