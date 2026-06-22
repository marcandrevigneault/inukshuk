import { Directory, File, Paths } from 'expo-file-system';

import type { BoundingBox } from '@core/models';
import { NetworkManager, OfflineManager } from '@maplibre/maplibre-react-native';

// MapLibre's offline `createPack` expects `mapStyle` to be a **style URL** it can
// fetch — NOT inline style JSON (passing JSON makes the native HTTP layer try to
// parse the whole string as a URL: "Unable to parse resourceUrl …"). So we
// serialize the active basemap's style to a small file and hand MapLibre a
// `file://` URI. The file persists (needed if a paused pack resumes) and is
// removed when its region is deleted.
const STYLES_DIR = 'offline-styles';

function styleFile(id: string): File {
  const dir = new Directory(Paths.document, STYLES_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${id}.json`);
}

/** Write the serialized style to a file and return its `file://` URI. */
function writeStyleFile(id: string, styleJSON: string): string {
  const f = styleFile(id);
  if (f.exists) f.delete();
  f.create();
  f.write(styleJSON);
  return f.uri;
}

export interface OfflineRegion {
  id: string;
  label: string;
  basemap: 'map' | 'satellite' | 'relief';
  bounds: BoundingBox;
  sizeBytes: number;
  complete: boolean;
}

// MapLibre LngLatBounds is [west, south, east, north].
const toLngLatBounds = (b: BoundingBox): [number, number, number, number] => [
  b.minLng,
  b.minLat,
  b.maxLng,
  b.maxLat,
];

// Metadata stored inside each OfflinePack (alongside the auto-generated pack UUID).
// We embed our own `id` here because OfflinePackCreateOptions has no `name` field —
// the native layer assigns a UUID that we cannot control.
interface PackMeta {
  // Our app-level region identifier (opaque string, e.g. uuid or slug).
  appId: string;
  label: string;
  basemap: OfflineRegion['basemap'];
}

function regionFromPack(
  packId: string, // native UUID assigned by MapLibre
  metadata: Record<string, unknown>,
  bounds: [number, number, number, number],
  status?: { percentage: number; completedTileSize: number },
): OfflineRegion {
  const meta = metadata as Partial<PackMeta>;
  const [w, s, e, n] = bounds;
  return {
    id: (meta.appId as string | undefined) ?? packId,
    label: (meta.label as string | undefined) ?? 'Region',
    basemap: (meta.basemap as OfflineRegion['basemap'] | undefined) ?? 'map',
    bounds: { minLng: w, minLat: s, maxLng: e, maxLat: n },
    sizeBytes: status?.completedTileSize ?? 0,
    complete: (status?.percentage ?? 0) >= 100,
  };
}

export function createRegionPack(
  args: {
    id: string;
    label: string;
    basemap: OfflineRegion['basemap'];
    styleJSON: string;
    bounds: BoundingBox;
    minZoom: number;
    maxZoom: number;
  },
  onProgress: (pct: number, sizeBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // OfflinePackCreateOptions has no `name` field — the native layer assigns a UUID.
    // We embed our app-level id in metadata so we can recover it in listRegionPacks().
    const meta: PackMeta = { appId: args.id, label: args.label, basemap: args.basemap };

    // Inline style JSON is rejected by the native offline downloader; write it to
    // a file and pass the file:// URI instead (see writeStyleFile above).
    const styleUri = writeStyleFile(args.id, args.styleJSON);

    OfflineManager.createPack(
      {
        mapStyle: styleUri,
        bounds: toLngLatBounds(args.bounds),
        minZoom: args.minZoom,
        maxZoom: args.maxZoom,
        metadata: meta as unknown as Record<string, unknown>,
      },
      (_pack, status) => {
        onProgress(status.percentage, status.completedTileSize);
        if (status.percentage >= 100) resolve();
      },
      (_pack, err) => reject(new Error(err.message)),
    ).catch(reject);
  });
}

export async function listRegionPacks(): Promise<OfflineRegion[]> {
  const packs = await OfflineManager.getPacks();
  const out: OfflineRegion[] = [];
  for (const p of packs) {
    const status = await p.status().catch(() => undefined);
    out.push(
      regionFromPack(p.id, p.metadata, p.bounds as [number, number, number, number], status),
    );
  }
  return out;
}

/**
 * Deletes the offline pack whose app-level id matches the given string.
 * Because MapLibre uses auto-generated UUIDs as the native pack identifier,
 * we scan the pack list to find the matching pack by its metadata.appId.
 */
export async function deleteRegionPack(id: string): Promise<void> {
  const packs = await OfflineManager.getPacks();
  const target = packs.find((p) => {
    const meta = p.metadata as Partial<PackMeta>;
    // Fall back to native pack UUID for packs created before metadata.appId was added.
    return meta.appId === id || p.id === id;
  });
  if (target) {
    await OfflineManager.deletePack(target.id);
  }
  // Remove the serialized style file we wrote for this region (best-effort).
  const f = styleFile(id);
  if (f.exists) f.delete();
}

/** Force MapLibre to serve only cached/pack tiles (true) or fetch normally (false). */
export function setOfflineOnly(on: boolean): void {
  NetworkManager.setConnected(!on);
}

export function setTileLimit(n: number): void {
  OfflineManager.setTileCountLimit(n);
}
