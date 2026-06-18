import type { BoundingBox } from '@core/models';
import { create } from 'zustand';

/** Base layer drawn under the overlays on the main map. */
export type MapBasemap = 'map' | 'satellite' | 'relief';

/**
 * Transient map view state that isn't persisted: which saved trails are shown as
 * overlays, whether the camera follows the user, and PDF-overlay visibility.
 * Trails are an overlay *set* (not a single focused track) so a whole bundle of
 * trails can be shown at once.
 */
interface MapState {
  /** Ids of saved trails currently drawn on the map. */
  activeTrackIds: string[];
  followUser: boolean;
  /** Whether PDF map overlays are drawn (visibility toggle, independent of which pages are active). */
  showPdfOverlay: boolean;
  /** Whether trail overlays are drawn. */
  showTrackOverlays: boolean;
  /** Whether the map shows a 3D relief (DEM hillshade + terrain + pitch). */
  terrain3d: boolean;
  /** Base layer: OSM streets, satellite imagery, or a topographic relief map. */
  basemap: MapBasemap;
  /** One-shot request for the map to fit these bounds (e.g. "view trail"). */
  focusBounds: BoundingBox | null;
  setActiveTrackIds: (ids: string[]) => void;
  toggleActiveTrack: (id: string) => void;
  clearActiveTracks: () => void;
  setFollowUser: (follow: boolean) => void;
  togglePdfOverlay: () => void;
  toggleTrackOverlays: () => void;
  toggleTerrain3d: () => void;
  setBasemap: (b: MapBasemap) => void;
  setFocusBounds: (b: BoundingBox | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  activeTrackIds: [],
  followUser: true,
  showPdfOverlay: true,
  showTrackOverlays: true,
  terrain3d: false,
  basemap: 'map',
  focusBounds: null,
  setFocusBounds: (b) => set({ focusBounds: b }),
  setActiveTrackIds: (ids) => set({ activeTrackIds: ids }),
  toggleActiveTrack: (id) =>
    set((s) => ({
      activeTrackIds: s.activeTrackIds.includes(id)
        ? s.activeTrackIds.filter((x) => x !== id)
        : [...s.activeTrackIds, id],
    })),
  clearActiveTracks: () => set({ activeTrackIds: [] }),
  setFollowUser: (follow) => set({ followUser: follow }),
  togglePdfOverlay: () => set((s) => ({ showPdfOverlay: !s.showPdfOverlay })),
  toggleTrackOverlays: () => set((s) => ({ showTrackOverlays: !s.showTrackOverlays })),
  toggleTerrain3d: () => set((s) => ({ terrain3d: !s.terrain3d })),
  setBasemap: (b) => set({ basemap: b }),
}));
