import type { Bundle, MapDocument } from '@core/models';
import { bundleCounts, bundleMapActivePages, pruneBundles, toggleId } from './bundles';

const mapDoc = (id: string, pages: number[]): MapDocument => ({
  id,
  name: id,
  fileUri: `file://${id}.pdf`,
  importedAt: 0,
  pageCount: pages.length,
  georeferences: pages.map((pageIndex) => ({ pageIndex }) as MapDocument['georeferences'][number]),
  activePages: [],
});

const bundle = (over: Partial<Bundle> = {}): Bundle => ({
  id: 'b1',
  name: 'Trip',
  mapIds: [],
  trackIds: [],
  createdAt: 0,
  ...over,
});

describe('bundleMapActivePages', () => {
  it('returns every georeferenced page index per existing member map', () => {
    const maps = [mapDoc('m1', [0, 1, 2]), mapDoc('m2', [0])];
    const out = bundleMapActivePages(bundle({ mapIds: ['m1', 'm2'] }), maps);
    expect(out).toEqual({ m1: [0, 1, 2], m2: [0] });
  });

  it('skips dangling (deleted) map ids', () => {
    const maps = [mapDoc('m1', [0])];
    expect(bundleMapActivePages(bundle({ mapIds: ['m1', 'gone'] }), maps)).toEqual({ m1: [0] });
  });
});

describe('bundleCounts', () => {
  it('counts only ids that still exist', () => {
    const b = bundle({ mapIds: ['m1', 'gone'], trackIds: ['t1', 't2'] });
    expect(bundleCounts(b, [{ id: 'm1' }], [{ id: 't1' }, { id: 't2' }])).toEqual({
      maps: 1,
      tracks: 2,
    });
  });
});

describe('toggleId', () => {
  it('adds when absent and removes when present', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('pruneBundles', () => {
  it('removes a deleted map id from every bundle', () => {
    const bs = [bundle({ id: 'b1', mapIds: ['m1', 'm2'] }), bundle({ id: 'b2', mapIds: ['m1'] })];
    const out = pruneBundles(bs, { mapId: 'm1' });
    expect(out[0]!.mapIds).toEqual(['m2']);
    expect(out[1]!.mapIds).toEqual([]);
  });

  it('removes a deleted track id and leaves maps untouched', () => {
    const out = pruneBundles([bundle({ mapIds: ['m1'], trackIds: ['t1', 't2'] })], {
      trackId: 't1',
    });
    expect(out[0]!.trackIds).toEqual(['t2']);
    expect(out[0]!.mapIds).toEqual(['m1']);
  });
});
