import type { TrackNote } from '@core/models';

/**
 * Pure helpers for trail annotations. No platform deps — the Zustand store and
 * the GPX editor are thin wrappers over these. Notes are anchored by distance
 * along the trail so their order (and numbering) is independent of insertion.
 */

/** Notes ordered along the trail (by distance, then creation) for stable numbering. */
export function orderNotes(notes: readonly TrackNote[]): TrackNote[] {
  return [...notes].sort((a, b) => a.distanceM - b.distanceM || a.createdAt - b.createdAt);
}

/** Remove the note with `id`. */
export function removeNoteById(notes: readonly TrackNote[], id: string): TrackNote[] {
  return notes.filter((n) => n.id !== id);
}

/** Replace the text of the note with `id` (trimmed); other notes untouched. */
export function updateNoteText(notes: readonly TrackNote[], id: string, text: string): TrackNote[] {
  return notes.map((n) => (n.id === id ? { ...n, text: text.trim() } : n));
}
