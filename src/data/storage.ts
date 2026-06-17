import { Directory, File, Paths } from 'expo-file-system';
import { nanoid } from 'nanoid/non-secure';

/**
 * Platform-coupled persistence for Inukshuk. Lives outside `src/core` (which stays
 * pure/testable). Uses the SDK 56 File/Directory API.
 *
 * Layout under the app document directory:
 *   maps/<id>.pdf      imported georeferenced PDFs
 *   tracks/<id>.gpx    saved recordings
 *   library.json       index of MapDocuments + track metadata
 */

const MAPS_DIR = 'maps';
const TRACKS_DIR = 'tracks';
const INDEX_FILE = 'library.json';

function mapsDir(): Directory {
  return new Directory(Paths.document, MAPS_DIR);
}
function tracksDir(): Directory {
  return new Directory(Paths.document, TRACKS_DIR);
}

/** Create the storage directories if they do not exist. Safe to call repeatedly. */
export function ensureStorage(): void {
  for (const dir of [mapsDir(), tracksDir()]) {
    if (!dir.exists) dir.create({ intermediates: true });
  }
}

export const newId = (): string => nanoid(12);

/**
 * Copy a picked PDF into app storage under a stable id. Returns the new file
 * uri. The original (often a temporary cache file from the picker) is untouched.
 */
export async function importPdf(sourceUri: string, id: string): Promise<string> {
  ensureStorage();
  const source = new File(sourceUri);
  const dest = new File(mapsDir(), `${id}.pdf`);
  if (dest.exists) dest.delete();
  await source.copy(dest);
  return dest.uri;
}

export async function readFileBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

function overlaysDir(): Directory {
  return new Directory(Paths.cache, 'overlays');
}

/**
 * Write a base64-encoded PNG into the cache and return its `file://` uri.
 *
 * MapLibre's Android `ImageSource` cannot consume a `data:` URI — `setURL` builds
 * a `java.net.URL` from it, which throws (no `data` protocol handler), then falls
 * back to loading drawable resource id 0 and crashes the app. Overlays must be
 * backed by a real file URL, so we materialize the rasterized page to disk.
 */
export function writeOverlayPng(id: string, base64Png: string): string {
  const dir = overlaysDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${id}.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(base64Png, { encoding: 'base64' });
  return file.uri;
}

export async function readFileBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

export async function readFileText(uri: string): Promise<string> {
  return new File(uri).text();
}

/** Write a GPX (or any text) document and return its uri. */
export function writeTrackGpx(id: string, gpx: string): string {
  ensureStorage();
  const file = new File(tracksDir(), `${id}.gpx`);
  if (file.exists) file.delete();
  file.create();
  file.write(gpx);
  return file.uri;
}

export function deleteFileAt(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function fileExists(uri: string): boolean {
  return new File(uri).exists;
}

/** Read a JSON document stored at the document root, or null if absent/corrupt. */
export async function readJson<T>(name: string): Promise<T | null> {
  const file = new File(Paths.document, name);
  if (!file.exists) return null;
  try {
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

export function writeJson(name: string, value: unknown): void {
  const file = new File(Paths.document, name);
  if (!file.exists) file.create();
  file.write(JSON.stringify(value));
}

/** Read the persisted library index, or null if it has never been written. */
export function readIndex<T>(): Promise<T | null> {
  return readJson<T>(INDEX_FILE);
}

export function writeIndex(value: unknown): void {
  writeJson(INDEX_FILE, value);
}
