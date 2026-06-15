import { epsgFromText, makeReprojector, proj4DefForEpsg, utmEpsg, utmFromEpsg } from './crs';

describe('crs — EPSG detection', () => {
  it('reads EPSG from WKT AUTHORITY', () => {
    expect(epsgFromText('GEOGCS["WGS 84",AUTHORITY["EPSG","4326"]]')).toBe(4326);
    expect(
      epsgFromText(
        'PROJCS["UTM 18N",GEOGCS["x",AUTHORITY["EPSG","4326"]],AUTHORITY["EPSG","32618"]]',
      ),
    ).toBe(32618);
  });

  it('reads EPSG:NNNN and urn forms', () => {
    expect(epsgFromText('EPSG:3857')).toBe(3857);
    expect(epsgFromText('urn:ogc:def:crs:EPSG::32617')).toBe(32617);
  });

  it('detects web mercator by name', () => {
    expect(epsgFromText('WGS 84 / Pseudo-Mercator')).toBe(3857);
  });

  it('detects UTM zone phrasing', () => {
    expect(epsgFromText('UTM zone 18N WGS84')).toBe(32618);
    expect(epsgFromText('UTM Zone 33 South WGS 84')).toBe(32733);
  });

  it('returns undefined for unrecognized text', () => {
    expect(epsgFromText(undefined)).toBeUndefined();
    expect(epsgFromText('some random label')).toBeUndefined();
  });
});

describe('crs — UTM helpers', () => {
  it('round-trips zone <-> epsg', () => {
    expect(utmEpsg(18, true)).toBe(32618);
    expect(utmEpsg(33, false)).toBe(32733);
    expect(utmFromEpsg(32618)).toEqual({ zone: 18, north: true });
    expect(utmFromEpsg(32733)).toEqual({ zone: 33, north: false });
    expect(utmFromEpsg(4326)).toBeNull();
  });

  it('builds proj4 defs for known EPSG codes', () => {
    expect(proj4DefForEpsg(4326)).toContain('longlat');
    expect(proj4DefForEpsg(3857)).toContain('merc');
    expect(proj4DefForEpsg(32618)).toContain('zone=18');
    expect(proj4DefForEpsg(99999)).toBeNull();
  });
});

describe('crs — reprojector', () => {
  it('passes WGS84 lon/lat through unchanged', () => {
    const r = makeReprojector({ epsg: 4326 });
    expect(r.isWgs84).toBe(true);
    expect(r.toWgs84(-75, 46)).toEqual([-75, 46]);
  });

  it('reprojects UTM 18N meters to lon/lat', () => {
    const r = makeReprojector({ epsg: 32618 });
    expect(r.isWgs84).toBe(false);
    const [lon, lat] = r.toWgs84(585000, 4511000);
    expect(lon).toBeGreaterThan(-74.5);
    expect(lon).toBeLessThan(-73.5);
    expect(lat).toBeGreaterThan(40.0);
    expect(lat).toBeLessThan(41.5);
  });

  it('falls back to pass-through for unknown CRS', () => {
    const r = makeReprojector({ epsg: 99999 });
    expect(r.isWgs84).toBe(true);
    expect(r.toWgs84(1, 2)).toEqual([1, 2]);
  });
});
