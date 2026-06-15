import { zlibSync } from 'fflate';
import { parseGeoPdf } from './parseGeoPdf';
import { latin1Bytes } from './testUtils';

/**
 * Build a PDF that stores its objects in a compressed object stream (/ObjStm)
 * and indexes everything through a cross-reference stream (/Type /XRef). This
 * exercises the FlateDecode + ObjStm + xref-stream code paths.
 *
 * Layout (object numbers):
 *   1 = Catalog (in ObjStm)
 *   2 = Pages   (in ObjStm)
 *   3 = Page + LGIDict (in ObjStm)
 *   4 = ObjStm (in-file)
 *   5 = XRef stream (in-file)
 */
function buildXrefStreamPdf(): Uint8Array {
  const objs: Record<number, string> = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3:
      '<< /Type /Page /MediaBox [0 0 100 100] /LGIDict ' +
      '<< /Type /LGIDict /Projection << /ProjectionType /GEOGRAPHIC >> ' +
      '/Registration [ [ (0) (0) (-10) (50) ] [ (100) (0) (-9) (50) ] ' +
      '[ (100) (100) (-9) (51) ] [ (0) (100) (-10) (51) ] ] >> >>',
  };

  // Build ObjStm payload: header "objNum offset" pairs, then concatenated bodies.
  const order = [1, 2, 3];
  let bodies = '';
  const offsets: number[] = [];
  for (const n of order) {
    offsets.push(bodies.length);
    bodies += objs[n] + ' ';
  }
  let header = '';
  for (let i = 0; i < order.length; i++) {
    header += `${order[i]} ${offsets[i]} `;
  }
  const first = header.length;
  const objStmData = header + bodies;
  const compressed = zlibSync(latin1Bytes(objStmData));

  // Assemble the file. Header + object 4 (ObjStm) + object 5 (XRef stream).
  const headerStr = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  let prefix = headerStr;

  const objStmOffset = prefix.length;
  const objStmDictStr =
    `4 0 obj\n<< /Type /ObjStm /N ${order.length} /First ${first} ` +
    `/Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`;
  // bytes: prefix + objStmDictStr + compressed + "\nendstream\nendobj\n"
  const beforeStream = latin1Bytes(prefix + objStmDictStr);
  const afterStream = latin1Bytes('\nendstream\nendobj\n');

  // Now the xref stream. We need byte offsets: ObjStm at objStmOffset; XRef at
  // xrefOffset (computed after we know the ObjStm block length).
  const objStmBlockLen =
    beforeStream.length - latin1Bytes(prefix).length + compressed.length + afterStream.length;
  const xrefOffset = objStmOffset + objStmBlockLen;

  // XRef stream entries for objects 0..5. W = [1 2 1].
  // type 0 = free; 1 = in-file (field2 = offset); 2 = in ObjStm (field2 = stm#, field3 = index).
  const entries: [number, number, number][] = [
    [0, 0, 0], // obj 0 free
    [2, 4, 0], // obj 1 in ObjStm 4 index 0
    [2, 4, 1], // obj 2 in ObjStm 4 index 1
    [2, 4, 2], // obj 3 in ObjStm 4 index 2
    [1, objStmOffset, 0], // obj 4 ObjStm in-file
    [1, xrefOffset, 0], // obj 5 XRef stream in-file
  ];
  const W = [1, 2, 1];
  const xrefRaw = new Uint8Array(entries.length * (W[0]! + W[1]! + W[2]!));
  let p = 0;
  for (const [t, f2, f3] of entries) {
    xrefRaw[p++] = t & 0xff;
    xrefRaw[p++] = (f2 >> 8) & 0xff;
    xrefRaw[p++] = f2 & 0xff;
    xrefRaw[p++] = f3 & 0xff;
  }
  const xrefCompressed = zlibSync(xrefRaw);
  const xrefDictStr =
    `5 0 obj\n<< /Type /XRef /Size ${entries.length} /Root 1 0 R ` +
    `/W [1 2 1] /Filter /FlateDecode /Length ${xrefCompressed.length} >>\nstream\n`;
  const xrefBefore = latin1Bytes(xrefDictStr);
  const xrefAfter = latin1Bytes('\nendstream\nendobj\n');

  const startxrefStr = `startxref\n${xrefOffset}\n%%EOF`;

  // Concatenate all byte chunks.
  const chunks = [
    beforeStream,
    compressed,
    afterStream,
    xrefBefore,
    xrefCompressed,
    xrefAfter,
    latin1Bytes(startxrefStr),
  ];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

describe('parseGeoPdf — compressed object streams + xref stream', () => {
  it('reads LGIDict from a page stored in a FlateDecode ObjStm', () => {
    const bytes = buildXrefStreamPdf();
    const res = parseGeoPdf(bytes);
    expect(res.pageCount).toBe(1);
    expect(res.georeferences).toHaveLength(1);
    const g = res.georeferences[0]!;
    expect(g.source).toBe('lgidict');
    expect(g.viewport.corners.topLeft[0]).toBeCloseTo(-10, 6);
    expect(g.viewport.corners.topLeft[1]).toBeCloseTo(51, 6);
    expect(g.viewport.corners.bottomRight[0]).toBeCloseTo(-9, 6);
    expect(g.viewport.corners.bottomRight[1]).toBeCloseTo(50, 6);
  });
});
