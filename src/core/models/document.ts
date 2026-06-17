import type { GeoReference } from './georeference';

/** An imported georeferenced PDF map and its resolved georeferencing. */
export interface MapDocument {
  id: string;
  name: string;
  /** Absolute file:// uri of the PDF stored in app storage. */
  fileUri: string;
  importedAt: number;
  pageCount: number;
  /** Every georeferenced page resolved from the PDF (one entry per such page). */
  georeferences: GeoReference[];
  /** Page indexes currently rendered as map overlays (a subset of georeferences). */
  activePages: number[];
  /** Human-readable note when georeferencing failed or is partial. */
  georeferenceWarning?: string;
  /** Id of the {@link Folder} this map is organized under; undefined = Ungrouped. */
  folderId?: string;
}
