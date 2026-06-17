import { create } from 'zustand';

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
  showPdfOverlay: boolean;
  setActiveTrackIds: (ids: string[]) => void;
  toggleActiveTrack: (id: string) => void;
  clearActiveTracks: () => void;
  setFollowUser: (follow: boolean) => void;
  togglePdfOverlay: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  activeTrackIds: [],
  followUser: true,
  showPdfOverlay: true,
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
}));
