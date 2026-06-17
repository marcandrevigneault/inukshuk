/**
 * Compass-heading smoothing. The raw magnetometer heading jitters rapidly; we
 * smooth it with a circular exponential moving average. Averaging is done on the
 * heading's unit vector (cos/sin) rather than the angle directly, so the 0°/360°
 * wraparound is handled correctly (e.g. 359° and 1° smooth toward 0°, not 180°).
 *
 * Pure (no platform deps) so the smoothing is unit-tested independently of the
 * sensor; `useCompass` just feeds it raw readings.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Wrap any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Circular mean of headings in degrees. Returns 0 for empty / fully-opposed input. */
export function circularMeanDeg(degrees: readonly number[]): number {
  let x = 0;
  let y = 0;
  for (const d of degrees) {
    const r = d * DEG2RAD;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  // Near-zero resultant (empty, or antipodal samples that cancel) has no defined
  // direction — return 0 rather than a noisy atan2 of floating-point dust.
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return 0;
  return normalizeDeg(Math.atan2(y, x) * RAD2DEG);
}

export interface HeadingSmoother {
  /** Feed a raw heading (deg); returns the updated smoothed heading [0,360). */
  push(deg: number): number;
  /** Current smoothed heading, or null before the first sample. */
  value(): number | null;
  /** Forget all history (e.g. when the sensor subscription restarts). */
  reset(): void;
}

/**
 * Circular exponential moving average over the heading unit vector.
 * `alpha` in (0, 1]: lower = smoother but laggier. 0.2 tames sensor jitter while
 * staying responsive within ~1s at typical update rates.
 */
export function createHeadingSmoother(alpha = 0.2): HeadingSmoother {
  if (!(alpha > 0 && alpha <= 1)) {
    throw new Error(`alpha must be in (0, 1], got ${alpha}`);
  }
  let x: number | null = null;
  let y = 0;

  const current = (): number | null =>
    x === null ? null : normalizeDeg(Math.atan2(y, x) * RAD2DEG);

  return {
    push(deg) {
      const r = normalizeDeg(deg) * DEG2RAD;
      const cx = Math.cos(r);
      const cy = Math.sin(r);
      if (x === null) {
        x = cx;
        y = cy;
      } else {
        x += alpha * (cx - x);
        y += alpha * (cy - y);
      }
      return normalizeDeg(Math.atan2(y, x) * RAD2DEG);
    },
    value: current,
    reset() {
      x = null;
      y = 0;
    },
  };
}
