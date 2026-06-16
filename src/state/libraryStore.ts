import type { GeoReference, MapDocument, Track, TrackSummary } from '@core/models';
import * as storage from '@data/storage';
import { create } from 'zustand';

/**
 * Normalize a persisted map document to the current shape. Older builds stored a
 * single `georeference` (or none); the current model stores `georeferences[]` +
 * `activePages[]`. This keeps existing libraries working after an update.
 */
function migrateDoc(raw: MapDocument & { georeference?: GeoReference | null }): MapDocument {
  const georeferences = Array.isArray(raw.georeferences)
    ? raw.georeferences
    : raw.georeference
      ? [raw.georeference]
      : [];
  const activePages = Array.isArray(raw.activePages)
    ? raw.activePages
    : georeferences.map((g) => g.pageIndex);
  return {
    id: raw.id,
    name: raw.name,
    fileUri: raw.fileUri,
    importedAt: raw.importedAt,
    pageCount: raw.pageCount,
    georeferences,
    activePages,
    georeferenceWarning: raw.georeferenceWarning,
  };
}

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
  /** Toggle whether a georeferenced page of a map is shown as an overlay. */
  toggleMapPage: (id: string, pageIndex: number) => void;
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
        maps: (index.maps ?? []).map(migrateDoc),
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

  toggleMapPage: (id, pageIndex) =>
    set((s) => {
      const next = {
        ...s,
        maps: s.maps.map((m) => {
          if (m.id !== id) return m;
          const on = m.activePages.includes(pageIndex);
          return {
            ...m,
            activePages: on
              ? m.activePages.filter((p) => p !== pageIndex)
              : [...m.activePages, pageIndex].sort((a, b) => a - b),
          };
        }),
      };
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
