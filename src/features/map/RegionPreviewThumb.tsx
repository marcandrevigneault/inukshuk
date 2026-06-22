/**
 * RegionPreviewThumb — a small live preview of the drawn region in one basemap
 * style. Rather than spin up a full MapLibre instance per basemap (heavy: 3 GL
 * surfaces alongside the main map), it fetches the single tile that best frames
 * the box and shows it as an Image. Same intent — "see your actual area in this
 * style" — at a fraction of the cost, and it reuses the tiles already cached by
 * the main map.
 */

import { basemapTileUrl } from './mapStyle';
import { centerTileForRegion } from '@core/geo/tiles';
import type { Basemap } from '@core/geo/tiles';
import type { BoundingBox } from '@core/models';
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';

interface Props {
  bbox: BoundingBox | null;
  basemap: Basemap;
  tileUrl: string;
  size: number;
}

function previewUri(bbox: BoundingBox, basemap: Basemap, tileUrl: string): string | null {
  const template = basemapTileUrl(basemap, tileUrl);
  if (!template) return null;
  const { x, y, z } = centerTileForRegion(bbox);
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function RegionPreviewThumb({ bbox, basemap, tileUrl, size }: Props): ReactElement {
  const theme = useTheme();
  const uri = useMemo(
    () => (bbox && tileUrl ? previewUri(bbox, basemap, tileUrl) : null),
    [bbox, basemap, tileUrl],
  );

  const box = { width: size, height: size, borderRadius: 8 };
  return (
    <View style={[styles.frame, box, { borderColor: theme.colors.outlineVariant }]}>
      {uri ? (
        <Image source={{ uri }} style={[box, styles.image]} resizeMode="cover" />
      ) : (
        <View style={[box, styles.placeholder, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Icon source="map-outline" size={size * 0.4} color={theme.colors.onSurfaceVariant} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
