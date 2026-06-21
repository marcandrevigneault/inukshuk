import type { Track } from '@core/models';
import { parseGpx } from '@core/geo/gpx';
import { buildImportedTrack, snapWaypointsToNotes, type ImportedNote } from '@core/geo/track';
import * as storage from '@data/storage';
import * as DocumentPicker from 'expo-document-picker';

export interface ImportedTrack {
  track: Track;
  fileUri: string;
  notes: ImportedNote[];
}

export type BulkGpxImportResult =
  | { kind: 'imported'; items: ImportedTrack[]; failed: number }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string };

function buildFromGpxText(
  text: string,
  id: string,
  fileUri: string,
  fallbackName: string,
): ImportedTrack {
  const { metadata, points, waypoints, hasTrackOrRoutePoints } = parseGpx(text);
  if (points.length === 0) {
    storage.deleteFileAt(fileUri);
    throw new Error('No track points');
  }
  const track = buildImportedTrack({
    id,
    points,
    name: metadata.name,
    fallbackName,
    fallbackTime: Date.now(),
  });
  const notes = hasTrackOrRoutePoints ? snapWaypointsToNotes(points, waypoints) : [];
  return { track, fileUri, notes };
}

/** Copy + parse one picked GPX asset into a Track (throws on failure / no points). */
async function importOne(asset: DocumentPicker.DocumentPickerAsset): Promise<ImportedTrack> {
  const id = storage.newId();
  const fileUri = await storage.importGpx(asset.uri, id);
  const text = await storage.readFileText(fileUri);
  return buildFromGpxText(
    text,
    id,
    fileUri,
    asset.name?.replace(/\.gpx$/i, '') ?? 'Imported trail',
  );
}

/** Import a GPX from an arbitrary opened URI (e.g. an Android "Open with" intent). */
export async function importGpxFromUri(uri: string, fallbackName: string): Promise<ImportedTrack> {
  const id = storage.newId();
  const text = await storage.readFileText(uri);
  const fileUri = storage.writeTrackGpx(id, text);
  return buildFromGpxText(text, id, fileUri, fallbackName);
}

/**
 * Let the user pick one or more GPX files, copy them into app storage, parse
 * their points, and build finished Tracks. GPX MIME types vary by source, so we
 * accept broadly and validate by parsing. Failed files are counted, not fatal.
 */
export async function pickAndImportGpxFiles(): Promise<BulkGpxImportResult> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/gpx+xml',
        'application/xml',
        'text/xml',
        'application/octet-stream',
        '*/*',
      ],
      copyToCacheDirectory: true,
      multiple: true,
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Picker failed' };
  }

  if (picked.canceled || picked.assets.length === 0) return { kind: 'canceled' };

  const items: ImportedTrack[] = [];
  let failed = 0;
  for (const asset of picked.assets) {
    try {
      items.push(await importOne(asset));
    } catch {
      failed += 1;
    }
  }
  return { kind: 'imported', items, failed };
}
