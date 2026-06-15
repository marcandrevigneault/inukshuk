import type { MapDocument, Track, TrackSummary } from '@core/models';
import * as storage from '@data/storage';
import { create } from 'zustand';

interface LibraryIndex {
  maps: MapDocument[];
  tracks: TrackSummary[];
  activeMapId: string | null;
}

interface LibraryState extends LibraryIndex {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addMap: (doc: MapDocument) => void;
  updateMap: (id: string, patch: Partial<MapDocument>) => void;
  removeMap: (id: string) => void;
  setActiveMap: (id: string | null) => void;
  addTrack: (track: Track, fileUri: string) => void;
  removeTrack: (id: string) => void;
  activeMap: () => MapDocument | null;
}

function persist(state: LibraryIndex): void {
  storage.writeIndex({
    maps: state.maps,
    tracks: state.tracks,
    activeMapId: state.activeMapId,
  } satisfies LibraryIndex);
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  maps: [],
  tracks: [],
  activeMapId: null,
  hydrated: false,

  hydrate: async () => {
    storage.ensureStorage();
    const index = await storage.readIndex<LibraryIndex>();
    if (index) {
      set({
        maps: index.maps ?? [],
        tracks: index.tracks ?? [],
        activeMapId: index.activeMapId ?? null,
        hydrated: true,
      });
    } else {
      set({ hydrated: true });
    }
  },

  addMap: (doc) =>
    set((s) => {
      const next = { ...s, maps: [doc, ...s.maps], activeMapId: doc.id };
      persist(next);
      return next;
    }),

  updateMap: (id, patch) =>
    set((s) => {
      const next = { ...s, maps: s.maps.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
      persist(next);
      return next;
    }),

  removeMap: (id) =>
    set((s) => {
      const doc = s.maps.find((m) => m.id === id);
      if (doc) storage.deleteFileAt(doc.fileUri);
      const next = {
        ...s,
        maps: s.maps.filter((m) => m.id !== id),
        activeMapId: s.activeMapId === id ? null : s.activeMapId,
      };
      persist(next);
      return next;
    }),

  setActiveMap: (id) =>
    set((s) => {
      const next = { ...s, activeMapId: id };
      persist(next);
      return next;
    }),

  addTrack: (track, fileUri) =>
    set((s) => {
      const summary: TrackSummary = {
        id: track.id,
        name: track.name,
        startedAt: track.startedAt,
        endedAt: track.endedAt,
        stats: track.stats,
        fileUri,
      };
      const next = { ...s, tracks: [summary, ...s.tracks] };
      persist(next);
      return next;
    }),

  removeTrack: (id) =>
    set((s) => {
      const t = s.tracks.find((x) => x.id === id);
      if (t) storage.deleteFileAt(t.fileUri);
      const next = { ...s, tracks: s.tracks.filter((x) => x.id !== id) };
      persist(next);
      return next;
    }),

  activeMap: () => {
    const { maps, activeMapId } = get();
    return maps.find((m) => m.id === activeMapId) ?? null;
  },
}));
