import type { ElevationProfile } from '@core/geo/track';

import { buildTrailPdfHtml, type TrailPdfArgs } from './trailPdf';

const profile = (hasElevation: boolean): ElevationProfile =>
  hasElevation
    ? {
        samples: [
          { distanceM: 0, elevationM: 100 },
          { distanceM: 500, elevationM: 150 },
          { distanceM: 1000, elevationM: 120 },
        ],
        totalDistanceM: 1000,
        minElevationM: 100,
        maxElevationM: 150,
        hasElevation: true,
      }
    : { samples: [], totalDistanceM: 0, minElevationM: 0, maxElevationM: 0, hasElevation: false };

const baseArgs = (over: Partial<TrailPdfArgs> = {}): TrailPdfArgs => ({
  name: 'Sentier du Test',
  subtitle: 'Jun 17, 2026',
  profile: profile(true),
  notes: [{ number: 1, distanceM: 500, text: 'Creek crossing', distanceLabel: '500 m' }],
  summaryRows: [
    ['Distance', '1.0 km'],
    ['Ascent', '50 m'],
  ],
  ...over,
});

describe('buildTrailPdfHtml', () => {
  it('includes the name, notes and summary values', () => {
    const html = buildTrailPdfHtml(baseArgs());
    expect(html).toContain('Sentier du Test');
    expect(html).toContain('Creek crossing');
    expect(html).toContain('500 m');
    expect(html).toContain('1.0 km');
    expect(html).toContain('page-break'); // summary on its own page
  });

  it('draws an inline SVG profile with a numbered pin when elevation exists', () => {
    const html = buildTrailPdfHtml(baseArgs());
    expect(html).toContain('<svg');
    expect(html).toContain('<circle'); // the note pin
  });

  it('falls back to a message when there is no elevation', () => {
    const html = buildTrailPdfHtml(baseArgs({ profile: profile(false) }));
    expect(html).not.toContain('<svg');
    expect(html).toContain('No elevation data');
  });

  it('embeds a photo data URI when present', () => {
    const html = buildTrailPdfHtml(
      baseArgs({
        notes: [
          {
            number: 1,
            distanceM: 500,
            text: 'View',
            distanceLabel: '500 m',
            photoDataUri: 'data:image/jpeg;base64,XXXX',
          },
        ],
      }),
    );
    expect(html).toContain('src="data:image/jpeg;base64,XXXX"');
  });

  it('escapes HTML in user text to avoid breaking the document', () => {
    const html = buildTrailPdfHtml(baseArgs({ name: 'A & B <tag>', notes: [] }));
    expect(html).toContain('A &amp; B &lt;tag&gt;');
    expect(html).not.toContain('<tag>');
  });
});
