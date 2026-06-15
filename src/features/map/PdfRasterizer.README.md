# PdfRasterizer

Fully-offline rasterizer that turns a single page of a PDF into a PNG data URI,
ready to drop into a MapLibre `ImageSource` (`source.url = pngDataUri`). It is
used to draw a georeferenced PDF map as an image overlay.

## Public API

```ts
import { PdfRasterizerProvider, usePdfRasterizer } from '@features/map/PdfRasterizer';

// Mount ONCE near the app root (e.g. in app/_layout.tsx):
<PdfRasterizerProvider>
  <App />
</PdfRasterizerProvider>;

// Anywhere below the provider:
const rasterize = usePdfRasterizer();
const result = await rasterize({ base64, pageIndex: 0, targetWidthPx: 2048 });
// result.pngDataUri -> "data:image/png;base64,..."
// result.{widthPx,heightPx}        -> rendered raster size
// result.{pageWidthPt,pageHeightPt} -> intrinsic page size in PDF points (1/72")
// result.pageCount                  -> total pages in the document
```

## How it works

A single hidden offscreen `react-native-webview` is the rendering engine. The
provider mounts it once at a 1×1, fully-transparent, off-screen position so its
JavaScript runs without painting anything visible or affecting layout.

1. On mount, the provider reads the two **bundled** pdf.js files from app assets
   and inlines them into a self-contained HTML string (`buildHtml`).
2. The WebView loads that HTML via `source={{ html }}`. The pdf.js main bundle
   runs inside its own `<script>` tag and exposes `window.pdfjsLib`. When ready,
   the page posts `{ id: "__ready__", ok: true }` back to RN.
3. To render, RN injects JavaScript over the bridge:
   - `window.__pdfReset()` clears any buffered input,
   - `window.__pdfAppend(chunk)` is called once per base64 chunk,
   - `window.__pdfRender(id, pageIndex, targetWidthPx)` decodes the base64 to a
     `Uint8Array` (via an `atob` loop), calls
     `pdfjsLib.getDocument({ data })`, grabs `getPage(pageIndex + 1)`, computes
     `scale = targetWidthPx / viewport(scale:1).width`, renders to an offscreen
     `<canvas>`, and reports `canvas.toDataURL('image/png')`.
4. The WebView posts `{ id, ok: true, pngDataUri, widthPx, heightPx, pageWidthPt,
pageHeightPt, pageCount }` (or `{ id, ok: false, error }`) back, which the
   provider matches to the pending promise by `id`.

### Queueing, timeouts, resilience

- Requests are **serialized** through an internal FIFO queue — only one render
  runs at a time because the WebView and its canvas are a single shared
  resource.
- Each request has a **30s timeout**; on timeout the promise rejects and the
  engine is freed so the queue keeps draining.
- If the WebView reloads or its content process crashes, `onLoadStart` flips the
  engine back to "not ready"; when the reloaded page re-posts `__ready__`, the
  queue resumes automatically.
- On provider unmount, all still-pending promises are rejected so callers never
  hang.

## Asset bundling (the offline guarantee)

The pdf.js **legacy UMD** builds are copied into `assets/pdfjs/`:

| Asset file (in repo)             | Source (node_modules)                       |
| -------------------------------- | ------------------------------------------- |
| `pdf.legacy.min.js.pdfjs`        | `pdfjs-dist/legacy/build/pdf.min.js`        |
| `pdf.worker.legacy.min.js.pdfjs` | `pdfjs-dist/legacy/build/pdf.worker.min.js` |

The files use a custom **`.pdfjs`** extension, registered as a Metro **asset**
extension in `metro.config.js`:

```js
config.resolver.assetExts = [...config.resolver.assetExts, 'pdfjs'];
```

That makes `require('../../../assets/pdfjs/pdf.legacy.min.js.pdfjs')` return a
Metro asset module id (instead of Metro trying to parse a 370 KB minified UMD
bundle as source). At runtime:

```ts
const asset = await Asset.fromModule(PDFJS_MAIN_ASSET).downloadAsync();
const source = await new File(asset.localUri ?? asset.uri).text(); // expo-file-system File API
```

`downloadAsync()` here just materializes the **bundled** asset onto the local
filesystem (in dev it may copy from the Metro dev server; in a release build the
asset already ships inside the app). The text is then inlined into the HTML.

`app.config.ts` sets `assetBundlePatterns: ['**/*']`, so the `.pdfjs` assets are
packaged into the standalone app.

**Offline guarantee:** the rendered HTML document references nothing remote — no
CDN, no `<script src="https://...">`, no `fetch`. pdf.js, its worker, the PDF
bytes, and the canvas all live inside the WebView. The WebView is configured
with `allowFileAccess={false}` and is fed an inline `html` string, so it cannot
and does not load anything over the network.

## Worker mode

pdf.js parses PDFs in a Web Worker by default. To stay offline, the inlined
script builds a **same-origin Blob-URL worker** from the bundled worker source:

```js
const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob));
```

Blob URLs are same-origin and require no network, so this works offline on both
iOS (WKWebView) and Android (System WebView). If `new Worker(...)` throws on a
given WebView, the code falls back to pdf.js's **main-thread "fake worker"** by
clearing `workerSrc`; rendering still succeeds, just on the UI thread of the
WebView (which is fine because the WebView is hidden/offscreen).

## Why pdfjs-dist 3.11.174

- It ships a **legacy UMD** build (`legacy/build/pdf.min.js` +
  `pdf.worker.min.js`) — a single global `window.pdfjsLib`, no ESM/`import`,
  Babel-lowered to broadly-supported syntax. That is exactly what loads reliably
  inside a WebView's JS engine on both platforms.
- pdf.js v4/v5 legacy builds still rely on newer runtime features
  (`Promise.withResolvers`, `structuredClone`, `Array.prototype.at`, etc.) that
  are not guaranteed in older Android System WebViews, so v3 is the safer floor
  for an offline trail app that may run on older devices.

## Limitations

- **One render at a time.** Calls queue; a long page blocks subsequent ones.
- **Memory.** Very large `targetWidthPx` values create large canvases; a
  2048-px-wide A0 page is already several MB of RGBA. Pick `targetWidthPx` to
  balance overlay sharpness against memory. The canvas is shrunk to 1×1 right
  after `toDataURL` to release memory promptly.
- **Data-URI size.** The PNG is returned as a base64 data URI over the bridge;
  for very large rasters this transfer is non-trivial. The WebView cannot write
  to the filesystem here, so the way to bound it is to lower `targetWidthPx`.
- **No font/asset fetching.** Standard fonts embedded in the PDF render fine.
  pdf.js's optional standard-font and CMap packs are **not** bundled, so a PDF
  that relies on non-embedded CJK fonts may render with substitutes. Trail maps
  almost always embed their fonts, so this is rarely an issue.
- **Dev vs. release.** In a release/standalone build the assets are bundled and
  fully offline. In Expo dev mode, `downloadAsync` may pull the asset from the
  Metro dev server the first time — that is a dev-only convenience, not a
  runtime network dependency of the shipped app.

## Sanity check

`src/features/map/__tests__` is not used for this; instead a lightweight Node
check (`scripts/pdfjs-sanity` is intentionally not committed as a heavy test
dep) confirmed that the legacy build files exist and that the main bundle begins
evaluating once browser globals (`URLSearchParams`, DOM) are present — i.e. the
only thing it needs is a real browser/WebView environment, which is exactly
where it runs. A full pixel render can only be verified on a device/simulator.
