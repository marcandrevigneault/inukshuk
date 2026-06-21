import { classifyIncomingUri } from './incomingFile';

it('detects .gpx by extension across file/content URIs', () => {
  expect(classifyIncomingUri('file:///x/Sentier%20A.gpx')).toEqual({
    kind: 'gpx',
    name: 'Sentier A',
  });
  expect(classifyIncomingUri('content://downloads/trail.GPX').kind).toBe('gpx');
});

it('falls back to a generic name and unknown kind', () => {
  expect(classifyIncomingUri('content://media/12345')).toEqual({
    kind: 'unknown',
    name: 'Imported trail',
  });
  expect(classifyIncomingUri('file:///x/notes.pdf').kind).toBe('unknown');
});
