import type { Folder, MapDocument, TrackSummary } from '@core/models';

/**
 * Pure helpers for the folder feature (organizing maps + trails by area). No
 * platform deps — the Zustand store and UI are thin wrappers over these.
 */

/** A folder together with the maps and trails currently assigned to it. */
export interface FolderGroup {
  folder: Folder;
  maps: MapDocument[];
  tracks: TrackSummary[];
}

/** The full folder view: one group per folder, plus the un-foldered leftovers. */
export interface FolderGrouping {
  groups: FolderGroup[];
  ungroupedMaps: MapDocument[];
  ungroupedTracks: TrackSummary[];
}

/**
 * Bucket maps and trails into their folders. Groups are returned in `folders`
 * order (each folder always appears, even when empty). Items whose `folderId`
 * is unset — or points at a folder that no longer exists — fall through to the
 * ungrouped leftovers, preserving their original order.
 */
export function groupByFolder(
  folders: readonly Folder[],
  maps: readonly MapDocument[],
  tracks: readonly TrackSummary[],
): FolderGrouping {
  const indexOf = new Map(folders.map((f, i) => [f.id, i]));
  const groups: FolderGroup[] = folders.map((f) => ({ folder: f, maps: [], tracks: [] }));
  const ungroupedMaps: MapDocument[] = [];
  const ungroupedTracks: TrackSummary[] = [];

  for (const m of maps) {
    const idx = m.folderId !== undefined ? indexOf.get(m.folderId) : undefined;
    if (idx === undefined) ungroupedMaps.push(m);
    else groups[idx]!.maps.push(m);
  }
  for (const t of tracks) {
    const idx = t.folderId !== undefined ? indexOf.get(t.folderId) : undefined;
    if (idx === undefined) ungroupedTracks.push(t);
    else groups[idx]!.tracks.push(t);
  }

  return { groups, ungroupedMaps, ungroupedTracks };
}

/** Total number of items (maps + trails) in a folder group. */
export function folderItemCount(group: FolderGroup): number {
  return group.maps.length + group.tracks.length;
}
