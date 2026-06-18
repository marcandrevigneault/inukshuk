import type { ElevationProfile } from '@core/geo/track';

/**
 * Pure builder for the trail-export PDF's HTML (rendered to PDF by expo-print in
 * the feature layer). No platform deps so it can be unit-tested: it assembles an
 * inline-SVG elevation profile, a numbered notes section, and a summary table on
 * a second page. Photos are passed in pre-encoded as data URIs.
 */

export interface TrailPdfNote {
  /** 1-based number shown in the pin and the list. */
  number: number;
  /** Distance along the trail, in metres (for pin placement). */
  distanceM: number;
  text: string;
  distanceLabel: string;
  /** `data:image/...;base64,...` of an attached photo, if any. */
  photoDataUri?: string;
}

export interface TrailPdfArgs {
  name: string;
  subtitle: string;
  profile: ElevationProfile;
  notes: readonly TrailPdfNote[];
  /** [label, value] rows for the summary table. */
  summaryRows: readonly (readonly [string, string])[];
}

const W = 540;
const H = 170;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the inline SVG for the elevation profile with numbered note pins. */
function profileSvg(profile: ElevationProfile, notes: readonly TrailPdfNote[]): string {
  if (!profile.hasElevation || profile.samples.length < 2) {
    return '<p class="muted">No elevation data was recorded for this trail.</p>';
  }
  const { samples, minElevationM, maxElevationM, totalDistanceM } = profile;
  const range = maxElevationM - minElevationM || 1;
  const total = totalDistanceM || 1;
  const x = (d: number) => ((Math.max(0, Math.min(d, totalDistanceM)) / total) * W).toFixed(1);
  const y = (e: number) => (H - ((e - minElevationM) / range) * (H - 12) - 6).toFixed(1);

  const pts = samples.map((s) => `${x(s.distanceM)} ${y(s.elevationM)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(totalDistanceM)} ${H} L0 ${H} Z`;

  const pins = notes
    .map((n) => {
      const px = x(n.distanceM);
      return `<line x1="${px}" y1="14" x2="${px}" y2="${H}" stroke="#4F7A3A" stroke-width="1" opacity="0.3"/>
<circle cx="${px}" cy="10" r="8" fill="#4F7A3A"/>
<text x="${px}" y="13.5" font-size="9" font-weight="bold" fill="#fff" text-anchor="middle">${n.number}</text>`;
    })
    .join('\n');

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<path d="${area}" fill="#4F7A3A" fill-opacity="0.15"/>
<path d="${line}" fill="none" stroke="#4F7A3A" stroke-width="2"/>
${pins}
</svg>`;
}

export function buildTrailPdfHtml(args: TrailPdfArgs): string {
  const { name, subtitle, profile, notes, summaryRows } = args;

  const notesHtml = notes.length
    ? notes
        .map(
          (n) => `<div class="note">
<div class="badge">${n.number}</div>
<div class="note-body">
<div class="note-text">${escapeHtml(n.text)}</div>
<div class="muted">${escapeHtml(n.distanceLabel)}</div>
${n.photoDataUri ? `<img class="note-photo" src="${n.photoDataUri}"/>` : ''}
</div>
</div>`,
        )
        .join('\n')
    : '<p class="muted">No notes were added to this trail.</p>';

  const summaryHtml = summaryRows
    .map(
      ([label, value]) =>
        `<tr><td class="muted">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
* { box-sizing: border-box; }
body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #242A20; margin: 28px; }
h1 { font-size: 22px; margin: 0 0 2px; }
.muted { color: #6b7280; font-size: 12px; }
.section { margin-top: 18px; }
.note { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee; }
.badge { flex: 0 0 22px; width: 22px; height: 22px; border-radius: 11px; background: #4F7A3A;
  color: #fff; font-weight: 700; font-size: 12px; text-align: center; line-height: 22px; }
.note-body { flex: 1; }
.note-text { font-size: 14px; white-space: pre-wrap; }
.note-photo { margin-top: 6px; max-width: 320px; max-height: 240px; border-radius: 8px; }
table { border-collapse: collapse; width: 100%; margin-top: 8px; }
td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 14px; }
.page-break { page-break-before: always; }
</style></head><body>
<h1>${escapeHtml(name)}</h1>
<div class="muted">${escapeHtml(subtitle)}</div>
<div class="section">${profileSvg(profile, notes)}</div>
<div class="section"><h2>Notes (${notes.length})</h2>${notesHtml}</div>
<div class="page-break"></div>
<div class="section"><h2>Summary</h2><table>${summaryHtml}</table></div>
</body></html>`;
}
