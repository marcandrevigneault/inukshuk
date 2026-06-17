import type { Track } from '@core/models';
import { parseGpx } from '@core/geo/gpx';
import { buildImportedTrack } from '@core/geo/track';
import * as storage from '@data/storage';
import * as DocumentPicker from 'expo-document-picker';

export type GpxImportResult =
  | { kind: 'imported'; track: Track; fileUri: string }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string };

/**
 * Let the user pick a GPX file, copy it into app storage, parse its track
 * points, and build a finished {@link Track} ready to add to the library.
 * Mirrors `pickAndImportMap`. GPX MIME types vary by source, so we accept
 * broadly and validate by actually parsing.
 */
export async function pickAndImportGpx(): Promise<GpxImportResult> {
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
      multiple: false,
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Picker failed' };
  }

  if (picked.canceled || picked.assets.length === 0) return { kind: 'canceled' };
  const asset = picked.assets[0];
  if (!asset) return { kind: 'canceled' };

  let fileUri: string | undefined;
  try {
    const id = storage.newId();
    fileUri = await storage.importGpx(asset.uri, id);
    const text = await storage.readFileText(fileUri);
    const { metadata, points } = parseGpx(text);
    if (points.length === 0) {
      storage.deleteFileAt(fileUri);
      return { kind: 'error', message: 'No track points found in this GPX file.' };
    }
    const track = buildImportedTrack({
      id,
      points,
      name: metadata.name,
      fallbackName: asset.name?.replace(/\.gpx$/i, '') ?? 'Imported trail',
      fallbackTime: Date.now(),
    });
    return { kind: 'imported', track, fileUri };
  } catch (err) {
    if (fileUri) storage.deleteFileAt(fileUri);
    return { kind: 'error', message: err instanceof Error ? err.message : 'Import failed' };
  }
}
