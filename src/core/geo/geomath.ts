import type { BoundingBox, CornerCoordinates, LatLng, LngLat, PointRect } from '@core/models';

/**
 * Pure 2D geometry helpers used by the map overlay and the georeference parsers.
 * No React-Native or platform dependencies — fully unit-testable.
 */

/** A 2D affine transform mapping (x, y) -> (a*x + b*y + c, d*x + e*y + f). */
export interface Affine2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const applyAffine = (t: Affine2D, x: number, y: number): [number, number] => [
  t.a * x + t.b * y + t.c,
  t.d * x + t.e * y + t.f,
];

/**
 * Least-squares fit of a 2D affine transform from >= 3 (src -> dst)
 * correspondences. Solves the normal equations for each output axis
 * independently (they share the same 3x3 design matrix). Throws if the source
 * points are collinear/degenerate.
 */
export function fitAffine(
  src: readonly (readonly [number, number])[],
  dst: readonly (readonly [number, number])[],
): Affine2D {
  if (src.length !== dst.length || src.length < 3) {
    throw new Error('fitAffine needs at least 3 matched point pairs');
  }

  // Build the symmetric 3x3 matrix M = sum [x y 1]^T [x y 1] and the
  // right-hand sides for the X and Y outputs.
  let sxx = 0;
  let sxy = 0;
  let sx = 0;
  let syy = 0;
  let sy = 0;
  let s1 = 0;
  let bX0 = 0;
  let bX1 = 0;
  let bX2 = 0;
  let bY0 = 0;
  let bY1 = 0;
  let bY2 = 0;

  for (let i = 0; i < src.length; i++) {
    const x = src[i]![0];
    const y = src[i]![1];
    const u = dst[i]![0];
    const v = dst[i]![1];
    sxx += x * x;
    sxy += x * y;
    sx += x;
    syy += y * y;
    sy += y;
    s1 += 1;
    bX0 += x * u;
    bX1 += y * u;
    bX2 += u;
    bY0 += x * v;
    bY1 += y * v;
    bY2 += v;
  }

  const m: number[][] = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, s1],
  ];

  const [a, b, c] = solve3x3(m, [bX0, bX1, bX2]);
  const [d, e, f] = solve3x3(m, [bY0, bY1, bY2]);
  return { a, b, c, d, e, f };
}

/** Solve a 3x3 linear system by Cramer's rule. Throws on singular matrices. */
function solve3x3(m: number[][], rhs: number[]): [number, number, number] {
  const det = det3(m);
  if (Math.abs(det) < 1e-12) {
    throw new Error('Degenerate control points: cannot fit affine transform');
  }
  const mx = [
    [rhs[0]!, m[0]![1]!, m[0]![2]!],
    [rhs[1]!, m[1]![1]!, m[1]![2]!],
    [rhs[2]!, m[2]![1]!, m[2]![2]!],
  ];
  const my = [
    [m[0]![0]!, rhs[0]!, m[0]![2]!],
    [m[1]![0]!, rhs[1]!, m[1]![2]!],
    [m[2]![0]!, rhs[2]!, m[2]![2]!],
  ];
  const mz = [
    [m[0]![0]!, m[0]![1]!, rhs[0]!],
    [m[1]![0]!, m[1]![1]!, rhs[1]!],
    [m[2]![0]!, m[2]![1]!, rhs[2]!],
  ];
  return [det3(mx) / det, det3(my) / det, det3(mz) / det];
}

function det3(m: number[][]): number {
  return (
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
    m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
  );
}

/**
 * Given the geographic corners of a viewport rectangle (a sub-region of a PDF
 * page) and that rectangle in PDF points, extrapolate the geographic corners of
 * a different (usually full-page) rectangle, assuming the page->geo mapping is
 * affine. This lets us overlay a full-page raster render even when only the map
 * frame is georeferenced.
 *
 * PDF point space has its origin at the bottom-left; the returned corners use
 * MapLibre's visual-top-first ordering.
 */
export function extrapolatePageCorners(
  viewportRect: PointRect,
  viewportCorners: CornerCoordinates,
  targetRect: PointRect,
): CornerCoordinates {
  // Viewport page-space corners, matched to their geographic corners. Visual
  // top corresponds to the larger Y in PDF point space.
  const src: [number, number][] = [
    [viewportRect.x0, viewportRect.y1], // top-left
    [viewportRect.x1, viewportRect.y1], // top-right
    [viewportRect.x1, viewportRect.y0], // bottom-right
    [viewportRect.x0, viewportRect.y0], // bottom-left
  ];
  const dst: [number, number][] = [
    viewportCorners.topLeft,
    viewportCorners.topRight,
    viewportCorners.bottomRight,
    viewportCorners.bottomLeft,
  ];
  const t = fitAffine(src, dst);
  const at = (x: number, y: number): LngLat => applyAffine(t, x, y) as LngLat;
  return {
    topLeft: at(targetRect.x0, targetRect.y1),
    topRight: at(targetRect.x1, targetRect.y1),
    bottomRight: at(targetRect.x1, targetRect.y0),
    bottomLeft: at(targetRect.x0, targetRect.y0),
  };
}

export function bboxFromLngLats(points: readonly LngLat[]): BoundingBox {
  if (points.length === 0) {
    throw new Error('bboxFromLngLats requires at least one point');
  }
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

export const bboxFromCorners = (c: CornerCoordinates): BoundingBox =>
  bboxFromLngLats([c.topLeft, c.topRight, c.bottomRight, c.bottomLeft]);

export function isInsideBBox(p: LatLng, b: BoundingBox): boolean {
  return (
    p.latitude >= b.minLat &&
    p.latitude <= b.maxLat &&
    p.longitude >= b.minLng &&
    p.longitude <= b.maxLng
  );
}

/** Expand a bbox by a fractional margin on each side (0.1 = +10%). */
export function padBBox(b: BoundingBox, fraction: number): BoundingBox {
  const dLat = (b.maxLat - b.minLat) * fraction;
  const dLng = (b.maxLng - b.minLng) * fraction;
  return {
    minLat: b.minLat - dLat,
    minLng: b.minLng - dLng,
    maxLat: b.maxLat + dLat,
    maxLng: b.maxLng + dLng,
  };
}
