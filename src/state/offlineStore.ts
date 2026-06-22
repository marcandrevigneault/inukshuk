import {
  createRegionPack,
  deleteRegionPack,
  listRegionPacks,
  setTileLimit,
  type OfflineRegion,
} from '@data/offline';
import { create } from 'zustand';

interface OfflineState {
  regions: OfflineRegion[];
  progress: { id: string; pct: number; sizeBytes: number } | null;
  hydrate: () => Promise<void>;
  download: (args: {
    id: string;
    label: string;
    basemap: OfflineRegion['basemap'];
    styleJSON: string;
    bounds: OfflineRegion['bounds'];
    minZoom: number;
    maxZoom: number;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  regions: [],
  progress: null,

  hydrate: async () => {
    setTileLimit(50_000); // headroom above the 25k UI cap
    set({ regions: await listRegionPacks() });
  },

  download: async (args) => {
    set({ progress: { id: args.id, pct: 0, sizeBytes: 0 } });
    try {
      await createRegionPack(args, (pct, sizeBytes) =>
        set({ progress: { id: args.id, pct, sizeBytes } }),
      );
    } finally {
      set({ progress: null, regions: await listRegionPacks() });
    }
  },

  remove: async (id) => {
    await deleteRegionPack(id);
    set({ regions: get().regions.filter((r) => r.id !== id) });
  },
}));
