import type { Bundle, MapDocument } from '@core/models';

/**
 * Pure helpers for the bundle feature (grouping maps + trails). No platform
 * deps — the Zustand store and UI are thin wrappers over these.
 */

/**
 * For each member map that still exists, the full list of its georeferenced
 * page indexes — i.e. exactly what "activate bundle" turns on for maps. Dangling
 * map ids (deleted maps) are skipped.
 */
export function bundleMapActivePages(
  bundle: Bundle,
  maps: readonly MapDocument[],
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const mapId of bundle.mapIds) {
    const m = maps.find((x) => x.id === mapId);
    if (m) out[mapId] = m.georeferences.map((g) => g.pageIndex);
  }
  return out;
}

/** Member counts for a bundle's subtitle, ignoring ids that no longer exist. */
export function bundleCounts(
  bundle: Bundle,
  maps: readonly { id: string }[],
  tracks: readonly { id: string }[],
): { maps: number; tracks: number } {
  return {
    maps: bundle.mapIds.filter((id) => maps.some((m) => m.id === id)).length,
    tracks: bundle.trackIds.filter((id) => tracks.some((t) => t.id === id)).length,
  };
}

/** Toggle an id's membership in a list (add if absent, remove if present). */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Drop a deleted item's id from every bundle (referential cleanup on remove). */
export function pruneBundles(
  bundles: readonly Bundle[],
  removed: { mapId?: string; trackId?: string },
): Bundle[] {
  return bundles.map((b) => ({
    ...b,
    mapIds: removed.mapId ? b.mapIds.filter((id) => id !== removed.mapId) : b.mapIds,
    trackIds: removed.trackId ? b.trackIds.filter((id) => id !== removed.trackId) : b.trackIds,
  }));
}
