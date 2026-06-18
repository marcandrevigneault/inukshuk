import { buildElevationProfile } from '@core/geo/track';
import { orderNotes } from '@core/library/notes';
import { buildTrailPdfHtml, type TrailPdfNote } from '@core/library/trailPdf';
import type { TrackPoint, TrackSummary } from '@core/models';
import * as storage from '@data/storage';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
  formatTimestamp,
} from '@lib/format';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Render a trail's elevation profile, numbered notes (with photos) and a summary
 * table to a PDF via expo-print, then hand it to the share sheet. Photos are
 * inlined as data URIs because the print webview doesn't reliably load file://.
 */
export async function exportTrailPdf(
  track: TrackSummary,
  points: readonly TrackPoint[],
): Promise<void> {
  const profile = buildElevationProfile(points);
  const ordered = orderNotes(track.notes ?? []);

  const notes: TrailPdfNote[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const n = ordered[i]!;
    let photoDataUri: string | undefined;
    if (n.photoUri) {
      try {
        const b64 = await storage.readFileBase64(n.photoUri);
        const mime = n.photoUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        photoDataUri = `data:${mime};base64,${b64}`;
      } catch {
        // A missing/unreadable photo just omits the image; the note still prints.
      }
    }
    notes.push({
      number: i + 1,
      distanceM: n.distanceM,
      text: n.text,
      distanceLabel: formatDistance(n.distanceM),
      photoDataUri,
    });
  }

  const s = track.stats;
  const opt = (label: string, value?: number, fmt?: (n: number) => string) =>
    value !== undefined ? ([[label, fmt ? fmt(value) : String(value)]] as [string, string][]) : [];

  const summaryRows: [string, string][] = [
    ['Distance', formatDistance(s.distanceM)],
    ['Elevation gain', formatElevation(s.ascentM)],
    ['Elevation loss', formatElevation(s.descentM)],
    ['Duration', formatDuration(s.durationS)],
    ['Moving time', formatDuration(s.movingTimeS)],
    ['Avg speed', formatSpeed(s.avgSpeedMps)],
    ['Max speed', formatSpeed(s.maxSpeedMps)],
    ...opt('Min elevation', s.minAltitudeM, formatElevation),
    ...opt('Max elevation', s.maxAltitudeM, formatElevation),
    ['Track points', String(s.pointCount)],
    ['Notes', String(ordered.length)],
  ];

  const html = buildTrailPdfHtml({
    name: track.name,
    subtitle: formatTimestamp(track.startedAt),
    profile,
    notes,
    summaryRows,
  });

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `${track.name}.pdf`,
    });
  }
}
