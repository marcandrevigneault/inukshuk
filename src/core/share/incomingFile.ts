/**
 * Decide whether an opened file URI is a GPX we can import, and derive a display
 * name from its path. Pure — handles file:// and content:// URIs. content:// URIs
 * often lack a readable filename, so callers fall back to this name only.
 */
export function classifyIncomingUri(uri: string): { kind: 'gpx' | 'unknown'; name: string } {
  let tail = uri.split('?')[0] ?? uri;
  tail = tail.substring(tail.lastIndexOf('/') + 1);
  let decoded = tail;
  try {
    decoded = decodeURIComponent(tail);
  } catch {
    /* keep raw tail if it is not valid percent-encoding */
  }
  const isGpx = /\.gpx$/i.test(decoded);
  const name = isGpx ? decoded.replace(/\.gpx$/i, '') : 'Imported trail';
  return { kind: isGpx ? 'gpx' : 'unknown', name };
}
