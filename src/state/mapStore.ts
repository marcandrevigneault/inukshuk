import type { TrackPoint } from '@core/models';
import { create } from 'zustand';

/**
 * Transient map view state that isn't persisted: which saved track (if any) is
 * being previewed on the map, and whether the camera should follow the user.
 */
interface MapState {
  focusedTrack: { id: string; points: TrackPoint[] } | null;
  followUser: boolean;
  showPdfOverlay: boolean;
  setFocusedTrack: (track: { id: string; points: TrackPoint[] } | null) => void;
  setFollowUser: (follow: boolean) => void;
  togglePdfOverlay: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  focusedTrack: null,
  followUser: true,
  showPdfOverlay: true,
  setFocusedTrack: (track) => set({ focusedTrack: track }),
  setFollowUser: (follow) => set({ followUser: follow }),
  togglePdfOverlay: () => set((s) => ({ showPdfOverlay: !s.showPdfOverlay })),
}));
