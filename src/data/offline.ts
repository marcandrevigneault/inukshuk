import StaticServer from '@dr.pogodin/react-native-static-server';
import { Directory, File, Paths } from 'expo-file-system';

import type { BoundingBox } from '@core/models';
import { NetworkManager, OfflineManager } from '@maplibre/maplibre-react-native';

// MapLibre's offline `createPack` expects `mapStyle` to be an **http(s) style URL**
// it can fetch through its native HTTP source — inline style JSON AND `file://`
// are both rejected ("Unable to parse resourceUrl …"). So during a download we
// serialize the active basemap's style to a file and serve it from a transient
// in-app HTTP server bound to loopback (127.0.0.1), then hand MapLibre that URL.
// The tiles themselves stream from the real OSM/Esri https endpoints; only the
// tiny style document needs a local http home. The style file persists (so a
// completed pack's bookkeeping is stable) and is removed when its region is
// deleted. Loopback cleartext is allowed via the withLocalhostCleartext plugin.
const STYLES_DIR = 'offline-styles';

function stylesDirectory(): Directory {
  const dir = new Directory(Paths.document, STYLES_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function styleFile(id: string): File {
  return new File(stylesDirectory(), `${id}.json`);
}

/** Write the serialized style to its file (overwriting any previous version). */
function writeStyleFile(id: string, styleJSON: string): void {
  const f = styleFile(id);
  if (f.exists) f.delete();
  f.create();
  f.write(styleJSON);
}

// The static server wants a plain filesystem path; expo-file-system gives file:// URIs.
function fsPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
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

export async function createRegionPack(
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
  // OfflinePackCreateOptions has no `name` field — the native layer assigns a UUID.
  // We embed our app-level id in metadata so we can recover it in listRegionPacks().
  const meta: PackMeta = { appId: args.id, label: args.label, basemap: args.basemap };

  // The transient loopback server is created up-front but only started inside the
  // try, so that ANY failure (including start() throwing) hits the finally cleanup.
  const server = new StaticServer({
    fileDir: fsPath(stylesDirectory().uri),
    port: 0,
    hostname: '127.0.0.1',
  });

  // Native pack id, captured from the progress/error listener's pack arg so we can
  // delete a partially-created pack if the download errors out.
  let nativePackId: string | undefined;

  try {
    writeStyleFile(args.id, args.styleJSON);

    // Serve the style file over loopback http so MapLibre's offline downloader can
    // fetch it (see the module header). Use port 0 (auto-pick a free port) and bind
    // to 127.0.0.1; start() resolves to the origin only once the server is ACTIVE.
    const origin = await server.start();
    const styleUrl = `${origin}/${args.id}.json`;

    await new Promise<void>((resolve, reject) => {
      OfflineManager.createPack(
        {
          mapStyle: styleUrl,
          bounds: toLngLatBounds(args.bounds),
          minZoom: args.minZoom,
          maxZoom: args.maxZoom,
          metadata: meta as unknown as Record<string, unknown>,
        },
        (pack, status) => {
          nativePackId = pack.id;
          onProgress(status.percentage, status.completedTileSize);
          if (status.percentage >= 100) resolve();
        },
        (pack, err) => {
          nativePackId = pack.id;
          reject(new Error(err.message));
        },
      )
        .then((pack) => {
          nativePackId = pack.id;
        })
        .catch(reject);
    });
  } catch (err) {
    // Best-effort: delete the partially-created native pack (so it doesn't show up
    // in Settings as a real region) and its orphaned style file. Don't mask `err`.
    if (nativePackId !== undefined) {
      await OfflineManager.deletePack(nativePackId).catch(() => undefined);
    }
    const f = styleFile(args.id);
    if (f.exists) f.delete();
    throw err;
  } finally {
    // The style is fetched once at the start of the download; the tiles stream from
    // their real https endpoints, so it is safe to tear the server down on completion.
    await server.stop().catch(() => undefined);
  }
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
