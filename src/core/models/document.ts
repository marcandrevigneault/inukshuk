import type { GeoReference } from './georeference';

/** An imported georeferenced PDF map and its resolved georeferencing. */
export interface MapDocument {
  id: string;
  name: string;
  /** Absolute file:// uri of the PDF stored in app storage. */
  fileUri: string;
  importedAt: number;
  pageCount: number;
  /** Georeference for the active page, or null if it could not be resolved. */
  georeference: GeoReference | null;
  /** Human-readable note when georeferencing failed or is partial. */
  georeferenceWarning?: string;
}
