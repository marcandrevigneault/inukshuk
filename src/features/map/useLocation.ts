import type { LatLng, TrackPoint } from '@core/models';
import { useRecorderStore } from '@state/recorderStore';
import { useSettingsStore } from '@state/settingsStore';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type LocationPermission = 'undetermined' | 'granted' | 'denied';

export interface LocationTracking {
  location: LatLng | null;
  /** Latest full fix, including altitude/accuracy. */
  lastFix: TrackPoint | null;
  permission: LocationPermission;
}

function toTrackPoint(loc: Location.LocationObject): TrackPoint {
  const c = loc.coords;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    altitude: c.altitude ?? undefined,
    accuracy: c.accuracy ?? undefined,
    altitudeAccuracy: c.altitudeAccuracy ?? undefined,
    speed: c.speed ?? undefined,
    time: loc.timestamp,
  };
}

/**
 * Requests foreground location permission and watches the device position.
 * A single watch drives both the on-screen marker and (when the recorder is
 * active) the recorded trail — the recorder store ignores points unless its
 * status is 'recording', so feeding it unconditionally is safe.
 */
export function useLocationTracking(): LocationTracking {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [lastFix, setLastFix] = useState<TrackPoint | null>(null);
  const [permission, setPermission] = useState<LocationPermission>('undetermined');
  const minDisplacement = useSettingsStore((s) => s.minDisplacementM);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: Math.max(1, minDisplacement),
        },
        (loc) => {
          const fix = toTrackPoint(loc);
          setLocation({ latitude: fix.latitude, longitude: fix.longitude });
          setLastFix(fix);
          // Recorder filters by status internally.
          useRecorderStore.getState().addPoint(fix);
        },
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [minDisplacement]);

  return { location, lastFix, permission };
}
