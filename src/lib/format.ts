/** Human-readable formatting for the live HUD and library. Pure functions. */

/** Metres -> "1.23 km" or "840 m". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

/** Metres -> "1 234 m" (elevation, no decimals). */
export function formatElevation(meters: number): string {
  if (!Number.isFinite(meters)) return '0 m';
  return `${Math.round(meters)} m`;
}

/** Seconds -> "H:MM:SS" or "M:SS". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** m/s -> "4.2 km/h". */
export function formatSpeed(mps: number): string {
  if (!Number.isFinite(mps) || mps < 0) return '0.0 km/h';
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

/** Heading degrees -> cardinal abbreviation (N, NE, …). */
export function headingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'N';
}

/** Epoch ms -> short local date+time, e.g. "Jun 15, 14:32". */
export function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
