import type { PdfDocument } from './pdfReader';
import { type PdfArray, type PdfDict, type PdfValue, isArray, isDict } from './types';

/** A page node with the inherited attributes we care about resolved. */
export interface PageInfo {
  index: number;
  dict: PdfDict;
  /** MediaBox [x0, y0, x1, y1] in PDF points. */
  mediaBox: [number, number, number, number];
}

const DEFAULT_MEDIABOX: [number, number, number, number] = [0, 0, 612, 792];

/** Read a numeric rectangle value (resolving refs and numbers). */
export function readRect(
  doc: PdfDocument,
  v: PdfValue | undefined,
): [number, number, number, number] | undefined {
  const arr = doc.resolve(v);
  if (!isArray(arr)) return undefined;
  const nums = (arr as PdfArray).map((x) => Number(doc.resolve(x)));
  if (nums.length < 4 || nums.some((n) => Number.isNaN(n))) return undefined;
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
}

/**
 * Walk the catalog /Pages tree depth-first, returning leaf pages in order with
 * inherited MediaBox resolved. Guards against cycles and runaway trees.
 */
export function collectPages(doc: PdfDocument): PageInfo[] {
  const root = doc.getTrailerRoot();
  const pages: PageInfo[] = [];
  if (!root) return pages;
  const pagesRoot = doc.resolve(root.entries.get('Pages'));
  if (!isDict(pagesRoot)) return pages;

  const visited = new Set<PdfDict>();
  let counter = 0;
  const MAX = 5000;

  const walk = (
    node: PdfValue | undefined,
    inheritedMb: [number, number, number, number],
  ): void => {
    const d = doc.resolve(node);
    if (!isDict(d) || visited.has(d) || counter > MAX) return;
    visited.add(d);
    const mb = readRect(doc, d.entries.get('MediaBox')) ?? inheritedMb;
    const type = d.entries.get('Type');
    const typeName = type && (type as { name?: string }).name;
    const kids = doc.resolve(d.entries.get('Kids'));

    if (typeName === 'Page' || (!isArray(kids) && typeName !== 'Pages')) {
      counter++;
      pages.push({ index: pages.length, dict: d, mediaBox: mb });
      return;
    }
    if (isArray(kids)) {
      for (const kid of kids as PdfArray) {
        walk(kid, mb);
      }
    }
  };

  walk(pagesRoot, DEFAULT_MEDIABOX);
  return pages;
}
