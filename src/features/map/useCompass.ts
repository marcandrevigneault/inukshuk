import { createHeadingSmoother } from '@core/signal/heading';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/**
 * Device compass heading in degrees (0–360, clockwise from north), or null
 * until the first reading. Prefers true heading, falling back to magnetic.
 * Requires location permission to already be granted.
 *
 * The raw magnetometer reading jitters rapidly, so it's passed through a
 * circular exponential moving average (see `@core/signal/heading`) before being
 * surfaced — the needle moves smoothly instead of twitching.
 */
export function useCompass(enabled = true): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    const smoother = createHeadingSmoother();

    (async () => {
      sub = await Location.watchHeadingAsync((h) => {
        if (cancelled) return;
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        setHeading(smoother.push(deg));
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return heading;
}
