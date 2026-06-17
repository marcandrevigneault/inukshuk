/**
 * A named collection of maps and/or GPX trails. Bundles are additive: items
 * still live in the flat library lists, an item can belong to several bundles,
 * and "activating" a bundle turns on all its overlays (every georeferenced page
 * of its maps + every one of its trails) in one tap.
 */
export interface Bundle {
  id: string;
  name: string;
  /** Ids of member maps (MapDocument.id). */
  mapIds: string[];
  /** Ids of member trails (TrackSummary.id). */
  trackIds: string[];
  createdAt: number;
}
