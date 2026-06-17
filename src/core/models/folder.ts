/**
 * A flat, named container that organizes maps and trails by area/trip. Unlike a
 * {@link Bundle} (which *activates* a set of overlays in one tap), a folder is
 * purely organizational: an item belongs to at most one folder, referenced by
 * `folderId` on the item itself. Items with no `folderId` are "Ungrouped".
 */
export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}
