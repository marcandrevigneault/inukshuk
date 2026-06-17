import * as storage from '@data/storage';
import { create } from 'zustand';

const SETTINGS_FILE = 'settings.json';

/**
 * The default OpenStreetMap raster tile endpoint. NOTE: the public OSM tile
 * servers have a usage policy that forbids heavy traffic. For a widely
 * distributed app, point this at your own raster cache or a free provider
 * (e.g. a self-hosted tileserver-gl, or Protomaps basemaps). Configurable here
 * so swapping the basemap never requires a code change.
 */
export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Visual style for the elevation profile chart. '3d' is a future feature. */
export type ElevationProfileStyle = 'gradient' | 'grid';

export interface Settings {
  tileUrl: string;
  /** Keep the screen awake while recording a trail. */
  keepAwakeWhileRecording: boolean;
  /** Rotate the map to match the device heading. */
  rotateMapWithHeading: boolean;
  /** Minimum metres between recorded GPS fixes (noise/density control). */
  minDisplacementM: number;
  /** Preferred elevation-profile chart style. */
  elevationProfileStyle: ElevationProfileStyle;
}

const DEFAULTS: Settings = {
  tileUrl: DEFAULT_TILE_URL,
  keepAwakeWhileRecording: true,
  rotateMapWithHeading: false,
  minDisplacementM: 5,
  elevationProfileStyle: 'gradient',
};

interface SettingsState extends Settings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

function persist(s: Settings): void {
  storage.writeJson(SETTINGS_FILE, s);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    const saved = await storage.readJson<Partial<Settings>>(SETTINGS_FILE);
    set({ ...DEFAULTS, ...(saved ?? {}), hydrated: true });
  },

  set: (key, value) => {
    set({ [key]: value } as Pick<Settings, typeof key>);
    const {
      tileUrl,
      keepAwakeWhileRecording,
      rotateMapWithHeading,
      minDisplacementM,
      elevationProfileStyle,
    } = get();
    persist({
      tileUrl,
      keepAwakeWhileRecording,
      rotateMapWithHeading,
      minDisplacementM,
      elevationProfileStyle,
    });
  },

  reset: () => {
    set({ ...DEFAULTS });
    persist(DEFAULTS);
  },
}));
