import type { MapDocument } from '@core/models';
import { parseGeoPdf } from '@core/geo/geopdf';
import * as storage from '@data/storage';
import * as DocumentPicker from 'expo-document-picker';

export type ImportResult =
  | { kind: 'imported'; doc: MapDocument }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string };

/**
 * Let the user pick a PDF, copy it into app storage, and resolve its embedded
 * georeferencing. A PDF with no recognizable georeferencing is still imported
 * (so it can be viewed as a plain document) but flagged with a warning.
 */
export async function pickAndImportMap(): Promise<ImportResult> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Picker failed' };
  }

  if (picked.canceled || picked.assets.length === 0) return { kind: 'canceled' };
  const asset = picked.assets[0];
  if (!asset) return { kind: 'canceled' };

  try {
    const id = storage.newId();
    const fileUri = await storage.importPdf(asset.uri, id);
    const bytes = await storage.readFileBytes(fileUri);
    const parsed = parseGeoPdf(bytes);
    const georeference = parsed.georeferences[0] ?? null;

    const doc: MapDocument = {
      id,
      name: asset.name?.replace(/\.pdf$/i, '') ?? 'Map',
      fileUri,
      importedAt: Date.now(),
      pageCount: parsed.pageCount,
      georeference,
      georeferenceWarning: georeference
        ? undefined
        : (parsed.warnings[0] ?? 'No georeferencing found in this PDF.'),
    };
    return { kind: 'imported', doc };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'Import failed' };
  }
}
