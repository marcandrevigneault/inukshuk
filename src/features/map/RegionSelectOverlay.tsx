/**
 * RegionSelectOverlay — an absolutely-positioned overlay over the map that
 * lets the user drag a rectangle to define a region for offline tile download.
 *
 * Four corner handles resize the box. A bottom bar shows the live tile/size
 * estimate and Download / Cancel actions. No MapLibre import: geo conversion
 * is injected via the `toGeo` prop.
 */

import { tileCountForRegion, overviewZoomFor, estimateBytes } from '@core/geo/tiles';
import type { BoundingBox } from '@core/models';
import { formatBytes } from '@lib/format';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { Button, Surface, Text, useTheme } from 'react-native-paper';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  /** Convert a screen point (px, relative to the overlay) to [lng, lat]. */
  toGeo: (screen: { x: number; y: number }) => Promise<[number, number]> | [number, number];
  basemap: 'map' | 'satellite';
  onConfirm: (bounds: BoundingBox, minZoom: number, maxZoom: number) => void;
  onCancel: () => void;
}

/** Rectangle in screen-space pixels, relative to the overlay's top-left. */
interface Box {
  x: number; // left
  y: number; // top
  w: number; // width  (always > 0)
  h: number; // height (always > 0)
}

interface Estimate {
  bbox: BoundingBox;
  tiles: number;
  bytes: number;
  minZoom: number;
  maxZoom: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HANDLE_SIZE = 28; // tap target for each corner handle (px)
const MIN_BOX = 48; // minimum box dimension (px)
const MAX_TILES = 25_000;
const MAX_ZOOM = 17;
const DEBOUNCE_MS = 120; // delay before recomputing estimate on drag

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegionSelectOverlay({ toGeo, basemap, onConfirm, onCancel }: Props): ReactElement {
  const theme = useTheme();

  // Overlay dimensions, populated via onLayout.
  const overlaySize = useRef({ w: 0, h: 0 });

  // Current box in screen space — written by gesture handlers via ref,
  // mirrored to state only for rendering.
  const boxRef = useRef<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 0, h: 0 });
  const initialised = useRef(false);

  // Box snapshot at gesture start (written in onGrant, read in onMove).
  const startBox = useRef<Box>({ x: 0, y: 0, w: 0, h: 0 });

  // Debounce timer for estimate recomputation.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sequence counter: discard stale async toGeo results (last-write-wins).
  const seqRef = useRef(0);

  // Live estimate state.
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  // ---------------------------------------------------------------------------
  // Initialise box once overlay dimensions are known.
  // ---------------------------------------------------------------------------

  const initBox = useCallback((ow: number, oh: number) => {
    if (initialised.current || ow === 0 || oh === 0) return;
    initialised.current = true;
    const bw = ow * 0.6;
    const bh = oh * 0.6;
    const initial: Box = {
      x: (ow - bw) / 2,
      y: (oh - bh) / 2,
      w: bw,
      h: bh,
    };
    boxRef.current = initial;
    setBox(initial);
  }, []);

  // ---------------------------------------------------------------------------
  // Estimate recomputation — debounced, last-write-wins for async toGeo.
  // Memoised with toGeo + basemap in deps; the PanResponders call the latest
  // version via `recomputeCallbackRef` (synced in an effect below).
  // ---------------------------------------------------------------------------

  const recomputeEstimate = useCallback(
    (b: Box) => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const seq = ++seqRef.current;

        const run = async () => {
          const tl = { x: b.x, y: b.y };
          const br = { x: b.x + b.w, y: b.y + b.h };

          const [tlResult, brResult] = await Promise.all([
            Promise.resolve(toGeo(tl)),
            Promise.resolve(toGeo(br)),
          ]);

          if (seq !== seqRef.current) return; // stale — discard

          const [lng0, lat0] = tlResult;
          const [lng1, lat1] = brResult;

          const bbox: BoundingBox = {
            minLat: Math.min(lat0, lat1),
            maxLat: Math.max(lat0, lat1),
            minLng: Math.min(lng0, lng1),
            maxLng: Math.max(lng0, lng1),
          };

          const minZoom = overviewZoomFor(bbox);
          const tiles = tileCountForRegion(bbox, minZoom, MAX_ZOOM);
          const bytes = estimateBytes(tiles, basemap);

          setEstimate({ bbox, tiles, bytes, minZoom, maxZoom: MAX_ZOOM });
        };

        run().catch(() => {
          /* toGeo failure — keep previous estimate */
        });
      }, DEBOUNCE_MS);
    },
    [toGeo, basemap],
  );

  // A stable ref that PanResponder gesture handlers (memoised once) can call
  // to always invoke the current version of recomputeEstimate. The ref itself
  // is only written inside an effect, never during render.
  const recomputeCallbackRef = useRef(recomputeEstimate);
  useEffect(() => {
    recomputeCallbackRef.current = recomputeEstimate;
  }, [recomputeEstimate]);

  // Re-run estimate when toGeo or basemap changes while the overlay is visible.
  useEffect(() => {
    if (boxRef.current.w > 0) recomputeEstimate(boxRef.current);
  }, [recomputeEstimate]);

  // ---------------------------------------------------------------------------
  // PanResponder — top-left corner.
  // Refs are read on touch events only, never during render.
  // ---------------------------------------------------------------------------

  const panTL = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          startBox.current = { ...boxRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const { x: sx, y: sy, w: sw, h: sh } = startBox.current;
          const { w: ow, h: oh } = overlaySize.current;
          let x = Math.min(sx + g.dx, sx + sw - MIN_BOX);
          let y = Math.min(sy + g.dy, sy + sh - MIN_BOX);
          x = Math.max(0, x);
          y = Math.max(0, y);
          let w = sw - (x - sx);
          let h = sh - (y - sy);
          if (x + w > ow) w = ow - x;
          if (y + h > oh) h = oh - y;
          if (w < MIN_BOX) w = MIN_BOX;
          if (h < MIN_BOX) h = MIN_BOX;
          const next: Box = { x, y, w, h };
          boxRef.current = next;
          setBox(next);
        },
        onPanResponderRelease: () => {
          recomputeCallbackRef.current(boxRef.current);
        },
      }),
    [],
  );

  // ---------------------------------------------------------------------------
  // PanResponder — top-right corner.
  // ---------------------------------------------------------------------------

  const panTR = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          startBox.current = { ...boxRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const { x: sx, y: sy, w: sw, h: sh } = startBox.current;
          const { w: ow, h: oh } = overlaySize.current;
          let y = Math.min(sy + g.dy, sy + sh - MIN_BOX);
          y = Math.max(0, y);
          let w = Math.max(sw + g.dx, MIN_BOX);
          let h = sh - (y - sy);
          if (sx + w > ow) w = ow - sx;
          if (y + h > oh) h = oh - y;
          if (w < MIN_BOX) w = MIN_BOX;
          if (h < MIN_BOX) h = MIN_BOX;
          const next: Box = { x: sx, y, w, h };
          boxRef.current = next;
          setBox(next);
        },
        onPanResponderRelease: () => {
          recomputeCallbackRef.current(boxRef.current);
        },
      }),
    [],
  );

  // ---------------------------------------------------------------------------
  // PanResponder — bottom-left corner.
  // ---------------------------------------------------------------------------

  const panBL = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          startBox.current = { ...boxRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const { x: sx, y: sy, w: sw, h: sh } = startBox.current;
          const { w: ow, h: oh } = overlaySize.current;
          let x = Math.min(sx + g.dx, sx + sw - MIN_BOX);
          x = Math.max(0, x);
          let w = sw - (x - sx);
          let h = Math.max(sh + g.dy, MIN_BOX);
          if (x + w > ow) w = ow - x;
          if (sy + h > oh) h = oh - sy;
          if (w < MIN_BOX) w = MIN_BOX;
          if (h < MIN_BOX) h = MIN_BOX;
          const next: Box = { x, y: sy, w, h };
          boxRef.current = next;
          setBox(next);
        },
        onPanResponderRelease: () => {
          recomputeCallbackRef.current(boxRef.current);
        },
      }),
    [],
  );

  // ---------------------------------------------------------------------------
  // PanResponder — bottom-right corner.
  // ---------------------------------------------------------------------------

  const panBR = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          startBox.current = { ...boxRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const { x: sx, y: sy, w: sw, h: sh } = startBox.current;
          const { w: ow, h: oh } = overlaySize.current;
          let w = Math.max(sw + g.dx, MIN_BOX);
          let h = Math.max(sh + g.dy, MIN_BOX);
          if (sx + w > ow) w = ow - sx;
          if (sy + h > oh) h = oh - sy;
          if (w < MIN_BOX) w = MIN_BOX;
          if (h < MIN_BOX) h = MIN_BOX;
          const next: Box = { x: sx, y: sy, w, h };
          boxRef.current = next;
          setBox(next);
        },
        onPanResponderRelease: () => {
          recomputeCallbackRef.current(boxRef.current);
        },
      }),
    [],
  );

  // ---------------------------------------------------------------------------
  // Confirm handler.
  // ---------------------------------------------------------------------------

  const handleConfirm = useCallback(() => {
    if (!estimate || estimate.tiles > MAX_TILES) return;
    onConfirm(estimate.bbox, estimate.minZoom, estimate.maxZoom);
  }, [estimate, onConfirm]);

  // ---------------------------------------------------------------------------
  // Render.
  // ---------------------------------------------------------------------------

  const tooLarge = (estimate?.tiles ?? 0) > MAX_TILES;
  const estimateLabel =
    estimate !== null
      ? `≈ ${estimate.tiles.toLocaleString()} tiles · ${formatBytes(estimate.bytes)}`
      : 'Calculating…';

  return (
    <View
      style={styles.overlay}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        overlaySize.current = { w: width, h: height };
        initBox(width, height);
      }}
      pointerEvents="box-none"
    >
      {/* Dimmed areas outside the selection box */}
      {box.w > 0 && box.h > 0 && (
        <>
          {/* Top strip */}
          <View
            style={[styles.dim, { top: 0, left: 0, right: 0, height: box.y }]}
            pointerEvents="none"
          />
          {/* Bottom strip */}
          <View
            style={[styles.dim, { top: box.y + box.h, left: 0, right: 0, bottom: 0 }]}
            pointerEvents="none"
          />
          {/* Left strip (middle row) */}
          <View
            style={[styles.dim, { top: box.y, left: 0, width: box.x, height: box.h }]}
            pointerEvents="none"
          />
          {/* Right strip (middle row) */}
          <View
            style={[styles.dim, { top: box.y, left: box.x + box.w, right: 0, height: box.h }]}
            pointerEvents="none"
          />

          {/* Selection border */}
          <View
            style={[
              styles.selectionBorder,
              { left: box.x, top: box.y, width: box.w, height: box.h },
            ]}
            pointerEvents="none"
          />

          {/* Corner handle — TL */}
          <View
            style={[styles.handle, { left: box.x - HANDLE_SIZE / 2, top: box.y - HANDLE_SIZE / 2 }]}
            {...panTL.panHandlers}
          >
            <View style={[styles.handleDot, { backgroundColor: theme.colors.primary }]} />
          </View>

          {/* Corner handle — TR */}
          <View
            style={[
              styles.handle,
              { left: box.x + box.w - HANDLE_SIZE / 2, top: box.y - HANDLE_SIZE / 2 },
            ]}
            {...panTR.panHandlers}
          >
            <View style={[styles.handleDot, { backgroundColor: theme.colors.primary }]} />
          </View>

          {/* Corner handle — BL */}
          <View
            style={[
              styles.handle,
              { left: box.x - HANDLE_SIZE / 2, top: box.y + box.h - HANDLE_SIZE / 2 },
            ]}
            {...panBL.panHandlers}
          >
            <View style={[styles.handleDot, { backgroundColor: theme.colors.primary }]} />
          </View>

          {/* Corner handle — BR */}
          <View
            style={[
              styles.handle,
              {
                left: box.x + box.w - HANDLE_SIZE / 2,
                top: box.y + box.h - HANDLE_SIZE / 2,
              },
            ]}
            {...panBR.panHandlers}
          >
            <View style={[styles.handleDot, { backgroundColor: theme.colors.primary }]} />
          </View>
        </>
      )}

      {/* Bottom bar */}
      <Surface style={styles.bar} elevation={4}>
        <Text variant="bodyMedium" style={styles.estimateText}>
          {tooLarge ? 'Too large — shrink the box' : estimateLabel}
        </Text>
        <View style={styles.barButtons}>
          <Button mode="outlined" onPress={onCancel} style={styles.barBtn}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            disabled={tooLarge || estimate === null}
            style={styles.barBtn}
          >
            Download
          </Button>
        </View>
      </Surface>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  selectionBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  handleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  estimateText: {
    textAlign: 'center',
  },
  barButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  barBtn: {
    minWidth: 110,
  },
});
