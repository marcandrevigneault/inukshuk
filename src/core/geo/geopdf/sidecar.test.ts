import { parseAuxXml } from './auxXml';
import { parseWorldFile } from './worldFile';

describe('parseWorldFile', () => {
  it('maps raster corners through the 6-line affine (EPSG:4326)', () => {
    // 1000x800 px raster. 0.001 deg/px in x, -0.001 deg/px in y.
    // Center of top-left pixel at (-75, 46).
    const worldText = ['0.001', '0', '0', '-0.001', '-75', '46'].join('\n');
    const g = parseWorldFile({
      worldText,
      rasterWidthPx: 1000,
      rasterHeightPx: 800,
      pageWidthPt: 500,
      pageHeightPt: 400,
    });
    expect(g.source).toBe('world-file');
    expect(g.sourceEpsg).toBe(4326);
    // Top-left corner = pixel (-0.5,-0.5): lon = -75 + 0.001*-0.5 = -75.0005
    expect(g.viewport.corners.topLeft[0]).toBeCloseTo(-75.0005, 6);
    expect(g.viewport.corners.topLeft[1]).toBeCloseTo(46.0005, 6);
    // Bottom-right = pixel (999.5, 799.5): lon = -75 + 0.001*999.5 = -74.0005
    expect(g.viewport.corners.bottomRight[0]).toBeCloseTo(-74.0005, 6);
    expect(g.viewport.corners.bottomRight[1]).toBeCloseTo(46 - 0.001 * 799.5, 6);
    expect(g.pageWidthPt).toBe(500);
    expect(g.viewport.rect).toEqual({ x0: 0, y0: 0, x1: 500, y1: 400 });
  });

  it('reprojects a UTM 18N world file to plausible lon/lat', () => {
    // 1 m/px near NYC.
    const worldText = ['1', '0', '0', '-1', '585000', '4511000'].join('\n');
    const g = parseWorldFile({
      worldText,
      rasterWidthPx: 1000,
      rasterHeightPx: 1000,
      pageWidthPt: 100,
      pageHeightPt: 100,
      epsg: 32618,
    });
    expect(g.sourceEpsg).toBe(32618);
    expect(g.bbox.minLng).toBeGreaterThan(-74.5);
    expect(g.bbox.maxLng).toBeLessThan(-73.5);
    expect(g.bbox.minLat).toBeGreaterThan(40.0);
    expect(g.bbox.maxLat).toBeLessThan(41.5);
  });

  it('throws on a malformed world file', () => {
    expect(() =>
      parseWorldFile({
        worldText: '1\n2\n3',
        rasterWidthPx: 10,
        rasterHeightPx: 10,
        pageWidthPt: 10,
        pageHeightPt: 10,
      }),
    ).toThrow(/6 numeric lines/);
  });
});

describe('parseAuxXml', () => {
  it('maps raster corners using a GeoTransform (EPSG via WKT)', () => {
    const xml = `<?xml version="1.0"?>
<PAMDataset>
  <SRS>GEOGCS["WGS 84",DATUM["WGS_1984"],AUTHORITY["EPSG","4326"]]</SRS>
  <GeoTransform>-75, 0.001, 0, 46, 0, -0.001</GeoTransform>
</PAMDataset>`;
    const g = parseAuxXml({
      xmlText: xml,
      rasterWidthPx: 1000,
      rasterHeightPx: 800,
      pageWidthPt: 500,
      pageHeightPt: 400,
    });
    expect(g.source).toBe('aux-xml');
    expect(g.sourceEpsg).toBe(4326);
    // geoX = -75 + 0.001*col ; geoY = 46 - 0.001*row
    // top-left pixel (0,0) -> (-75, 46)
    expect(g.viewport.corners.topLeft[0]).toBeCloseTo(-75, 6);
    expect(g.viewport.corners.topLeft[1]).toBeCloseTo(46, 6);
    // bottom-right pixel (1000,800) -> (-74, 45.2)
    expect(g.viewport.corners.bottomRight[0]).toBeCloseTo(-74, 6);
    expect(g.viewport.corners.bottomRight[1]).toBeCloseTo(46 - 0.001 * 800, 6);
  });

  it('falls back to GCPs when no GeoTransform present', () => {
    const xml = `<PAMDataset>
  <SRS>EPSG:4326</SRS>
  <GCP Pixel="0" Line="0" X="-75" Y="46"/>
  <GCP Pixel="1000" Line="0" X="-74" Y="46"/>
  <GCP Pixel="0" Line="800" X="-75" Y="45.2"/>
</PAMDataset>`;
    const g = parseAuxXml({
      xmlText: xml,
      rasterWidthPx: 1000,
      rasterHeightPx: 800,
      pageWidthPt: 100,
      pageHeightPt: 80,
    });
    expect(g.viewport.corners.topLeft[0]).toBeCloseTo(-75, 5);
    expect(g.viewport.corners.topLeft[1]).toBeCloseTo(46, 5);
    expect(g.viewport.corners.bottomRight[0]).toBeCloseTo(-74, 5);
  });

  it('reprojects a UTM 18N GeoTransform to plausible lon/lat', () => {
    const xml = `<PAMDataset>
  <SRS>PROJCS["WGS 84 / UTM zone 18N",AUTHORITY["EPSG","32618"]]</SRS>
  <GeoTransform>585000, 1, 0, 4511000, 0, -1</GeoTransform>
</PAMDataset>`;
    const g = parseAuxXml({
      xmlText: xml,
      rasterWidthPx: 1000,
      rasterHeightPx: 1000,
      pageWidthPt: 100,
      pageHeightPt: 100,
    });
    expect(g.sourceEpsg).toBe(32618);
    expect(g.bbox.minLng).toBeGreaterThan(-74.5);
    expect(g.bbox.maxLng).toBeLessThan(-73.5);
    expect(g.bbox.minLat).toBeGreaterThan(40.0);
  });

  it('throws when neither GeoTransform nor enough GCPs', () => {
    const xml = '<PAMDataset><SRS>EPSG:4326</SRS></PAMDataset>';
    expect(() =>
      parseAuxXml({
        xmlText: xml,
        rasterWidthPx: 10,
        rasterHeightPx: 10,
        pageWidthPt: 10,
        pageHeightPt: 10,
      }),
    ).toThrow(/GeoTransform|GCP/);
  });
});
