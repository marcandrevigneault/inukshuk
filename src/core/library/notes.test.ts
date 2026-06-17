import type { TrackNote } from '@core/models';

import { orderNotes, removeNoteById, updateNoteText } from './notes';

const note = (id: string, distanceM: number, createdAt = 0, text = `note-${id}`): TrackNote => ({
  id,
  distanceM,
  text,
  createdAt,
});

describe('orderNotes', () => {
  it('orders by distance along the trail', () => {
    const ordered = orderNotes([note('a', 500), note('b', 100), note('c', 300)]);
    expect(ordered.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by creation time so numbering is stable', () => {
    const ordered = orderNotes([note('a', 100, 20), note('b', 100, 10)]);
    expect(ordered.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input', () => {
    const input = [note('a', 2), note('b', 1)];
    orderNotes(input);
    expect(input.map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('removeNoteById / updateNoteText', () => {
  it('removes only the matching note', () => {
    const out = removeNoteById([note('a', 1), note('b', 2)], 'a');
    expect(out.map((n) => n.id)).toEqual(['b']);
  });

  it('updates and trims the matching note text only', () => {
    const out = updateNoteText([note('a', 1, 0, 'old'), note('b', 2, 0, 'keep')], 'a', '  new  ');
    expect(out.find((n) => n.id === 'a')!.text).toBe('new');
    expect(out.find((n) => n.id === 'b')!.text).toBe('keep');
  });
});
