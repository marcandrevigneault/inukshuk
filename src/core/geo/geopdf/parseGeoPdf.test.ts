import { parseGeoPdf } from './parseGeoPdf';
import { buildClassicPdf, latin1Bytes } from './testUtils';

/**
 * Builds a 3-object PDF: catalog -> pages -> single page. The page object body
 * is supplied so each test can attach its own georeferencing.
 */
function pdfWithPage(pageBody: string): Uint8Array {
  return buildClassicPdf(
    ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', pageBody],
    1,
  );
}

describe('parseGeoPdf — LGIDict (EPSG:4326)', () => {
  it('maps 4 registration points (page->lon/lat) to corners', () => {
    // Page is 200x100 pt. Registration maps page corners to a clean lon/lat box:
    //   page (0,0)     -> (-75, 45)   bottom-left
    //   page (200,0)   -> (-74, 45)   bottom-right
    //   page (200,100) -> (-74, 46)   top-right
    //   page (0,100)   -> (-75, 46)   top-left
    const page =
      '<< /Type /Page /MediaBox [0 0 200 100] /LGIDict ' +
      '<< /Type /LGIDict /Version 2 ' +
      '/Projection << /ProjectionType /GEOGRAPHIC /Datum /WE >> ' +
      '/Neatline [0 0 200 0 200 100 0 100] ' +
      '/Registration [ ' +
      '[ (0) (0) (-75) (45) ] ' +
      '[ (200) (0) (-74) (45) ] ' +
      '[ (200) (100) (-74) (46) ] ' +
      '[ (0) (100) (-75) (46) ] ' +
      '] >> >>';
    const res = parseGeoPdf(pdfWithPage(page));
    expect(res.pageCount).toBe(1);
    expect(res.georeferences).toHaveLength(1);
    const g = res.georeferences[0]!;
    expect(g.source).toBe('lgidict');
    expect(g.sourceEpsg).toBe(4326);
    // Visual top = larger Y in page space.
    expect(g.viewport.corners.topLeft[0]).toBeCloseTo(-75, 6);
    expect(g.viewport.corners.topLeft[1]).toBeCloseTo(46, 6);
    expect(g.viewport.corners.topRight[0]).toBeCloseTo(-74, 6);
    expect(g.viewport.corners.topRight[1]).toBeCloseTo(46, 6);
    expect(g.viewport.corners.bottomRight[0]).toBeCloseTo(-74, 6);
    expect(g.viewport.corners.bottomRight[1]).toBeCloseTo(45, 6);
    expect(g.viewport.corners.bottomLeft[0]).toBeCloseTo(-75, 6);
    expect(g.viewport.corners.bottomLeft[1]).toBeCloseTo(45, 6);
    expect(g.bbox.minLng).toBeCloseTo(-75, 6);
    expect(g.bbox.maxLat).toBeCloseTo(46, 6);
    expect(g.pageWidthPt).toBe(200);
    expect(g.pageHeightPt).toBe(100);
  });

  it('reprojects a UTM zone 18N (EPSG:32618) LGIDict to plausible lon/lat', () => {
    // A small box near New York City in UTM 18N meters.
    //   easting 585000..586000, northing 4510000..4511000
    const page =
      '<< /Type /Page /MediaBox [0 0 100 100] /LGIDict ' +
      '<< /Type /LGIDict /Version 2 ' +
      '/Projection << /ProjectionType /UT /Zone 18 /Hemisphere /N /Datum /WE >> ' +
      '/Registration [ ' +
      '[ (0) (0) (585000) (4510000) ] ' +
      '[ (100) (0) (586000) (4510000) ] ' +
      '[ (100) (100) (586000) (4511000) ] ' +
      '[ (0) (100) (585000) (4511000) ] ' +
      '] >> >>';
    const res = parseGeoPdf(pdfWithPage(page));
    expect(res.georeferences).toHaveLength(1);
    const g = res.georeferences[0]!;
    expect(g.sourceEpsg).toBe(32618);
    // NYC area: lon ~ -74, lat ~ 40.7. Loose tolerance.
    expect(g.bbox.minLng).toBeGreaterThan(-74.5);
    expect(g.bbox.maxLng).toBeLessThan(-73.5);
    expect(g.bbox.minLat).toBeGreaterThan(40.0);
    expect(g.bbox.maxLat).toBeLessThan(41.5);
    // Top edge (larger Y / larger northing) is further north than the bottom.
    expect(g.viewport.corners.topLeft[1]).toBeGreaterThan(g.viewport.corners.bottomLeft[1]);
  });

  it('accepts an LGIDict array on the page', () => {
    const page =
      '<< /Type /Page /MediaBox [0 0 10 10] /LGIDict [ ' +
      '<< /Type /LGIDict /Projection << /ProjectionType /GEOGRAPHIC >> ' +
      '/Registration [ [ (0) (0) (0) (0) ] [ (10) (0) (1) (0) ] [ (10) (10) (1) (1) ] ] >> ' +
      '] >>';
    const res = parseGeoPdf(pdfWithPage(page));
    expect(res.georeferences).toHaveLength(1);
    expect(res.georeferences[0]!.source).toBe('lgidict');
  });
});

describe('parseGeoPdf — Adobe VP/Measure GEO', () => {
  it('maps a viewport BBox to corners using GPTS (lat,lon order)', () => {
    // BBox covers the page. GPTS gives the geo position of the bbox corners.
    // BOUNDS defaults to corners 0,0 0,1 1,1 1,0. GPTS pairs are lat,lon.
    //   (0,0)->(45,-75)  (0,1)->(46,-75)  (1,1)->(46,-74)  (1,0)->(45,-74)
    const page =
      '<< /Type /Page /MediaBox [0 0 200 100] /VP [ ' +
      '<< /Type /Viewport /BBox [0 0 200 100] ' +
      '/Measure << /Type /Measure /Subtype /GEO ' +
      '/BOUNDS [0 0 0 1 1 1 1 0] ' +
      '/GPTS [45 -75 46 -75 46 -74 45 -74] ' +
      '/GCS << /Type /GEOGCS /EPSG 4326 >> ' +
      '>> >> ] >>';
    const res = parseGeoPdf(pdfWithPage(page));
    expect(res.pageCount).toBe(1);
    expect(res.georeferences).toHaveLength(1);
    const g = res.georeferences[0]!;
    expect(g.source).toBe('adobe-geo');
    expect(g.sourceEpsg).toBe(4326);
    // topLeft = unit (0,1) -> (lat 46, lon -75)
    expect(g.viewport.corners.topLeft[0]).toBeCloseTo(-75, 6);
    expect(g.viewport.corners.topLeft[1]).toBeCloseTo(46, 6);
    expect(g.viewport.corners.bottomRight[0]).toBeCloseTo(-74, 6);
    expect(g.viewport.corners.bottomRight[1]).toBeCloseTo(45, 6);
  });

  it('reads GCS WKT to detect EPSG when no /EPSG key present', () => {
    const wkt = 'GEOGCS[\\"WGS 84\\",DATUM[\\"WGS_1984\\"],AUTHORITY[\\"EPSG\\",\\"4326\\"]]';
    const page =
      '<< /Type /Page /MediaBox [0 0 100 100] /VP [ ' +
      '<< /Type /Viewport /BBox [0 0 100 100] ' +
      '/Measure << /Subtype /GEO ' +
      '/GPTS [10 20 11 20 11 21 10 21] ' +
      `/GCS << /Type /GEOGCS /WKT (${wkt}) >> ` +
      '>> >> ] >>';
    const res = parseGeoPdf(pdfWithPage(page));
    expect(res.georeferences).toHaveLength(1);
    expect(res.georeferences[0]!.sourceEpsg).toBe(4326);
  });
});

describe('parseGeoPdf — robustness', () => {
  it('returns empty georeferences with a warning for a garbage PDF', () => {
    const garbage = latin1Bytes('%PDF-1.7\nthis is not a real pdf at all\n%%EOF');
    const res = parseGeoPdf(garbage);
    expect(res.georeferences).toHaveLength(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('does not throw on totally non-PDF bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
    expect(() => parseGeoPdf(bytes)).not.toThrow();
    const res = parseGeoPdf(bytes);
    expect(res.georeferences).toHaveLength(0);
  });

  it('handles a valid PDF page with no georeferencing', () => {
    const page = '<< /Type /Page /MediaBox [0 0 612 792] >>';
    const res = parseGeoPdf(pdfWithPage(page));
    expect(res.pageCount).toBe(1);
    expect(res.georeferences).toHaveLength(0);
    expect(res.warnings.some((w) => /no embedded georeferencing/.test(w))).toBe(true);
  });

  it('tolerates indirect references and comments', () => {
    // MediaBox via indirect ref (object 4); registration inline.
    const bytes = buildClassicPdf(
      [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '% a comment here\n<< /Type /Page /MediaBox 4 0 R /LGIDict ' +
          '<< /Projection << /ProjectionType /GEOGRAPHIC >> ' +
          '/Registration [ [ (0) (0) (0) (0) ] [ (10) (0) (1) (0) ] [ (0) (10) (0) (1) ] ] >> >>',
        '[0 0 10 10]',
      ],
      1,
    );
    const res = parseGeoPdf(bytes);
    expect(res.pageCount).toBe(1);
    expect(res.georeferences).toHaveLength(1);
    expect(res.georeferences[0]!.pageWidthPt).toBe(10);
  });
});
