/**
 * Test-only helper: build a minimal but valid classic-xref PDF from a list of
 * object bodies, computing correct byte offsets and a `xref`/`trailer`.
 *
 * Object N is `objects[N-1]` (1-indexed in the PDF). The trailer's /Root points
 * at `rootObjNum`. Strings are encoded latin1 (1 byte per char).
 *
 * This lives next to the code (not in __tests__) so tests can import it without
 * path gymnastics; it is excluded from coverage via the `!index/test` globs and
 * is harmless in production (never imported by runtime code).
 */
export function buildClassicPdf(objects: string[], rootObjNum: number): Uint8Array {
  const header = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  let body = header;
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = body.length;
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n`;
  xref += '0000000000 65535 f \n';
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root ${rootObjNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const full = body + xref + trailer;
  return latin1Bytes(full);
}

/** Encode a latin1 string into bytes. */
export function latin1Bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
