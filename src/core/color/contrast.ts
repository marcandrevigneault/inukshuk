/**
 * WCAG 2.1 relative-luminance and contrast-ratio helpers. Pure (no platform
 * deps) so the theme's color choices can be unit-gated for legibility — this is
 * an outdoor trail app, so secondary text must stay readable in bright light.
 */

/** Parse a `#RRGGBB` (or `RRGGBB`) hex string to [r, g, b] in 0..255. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`invalid hex color: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Parse a color to [r, g, b] in 0..255. Accepts `#RRGGBB` hex and CSS
 * `rgb()`/`rgba()` strings — react-native-paper's MD3 default colors are rgba,
 * while our overrides are hex, so the theme gate must handle both.
 */
export function parseColor(color: string): [number, number, number] {
  const s = color.trim();
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return hexToRgb(s);
}

/** WCAG relative luminance (0..1) of an sRGB color (hex or rgb/rgba). */
export function relativeLuminance(color: string): number {
  const [r, g, b] = parseColor(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1..21) between two colors. Symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
