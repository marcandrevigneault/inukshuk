/**
 * Ambient module declarations for the bundled pdf.js builds.
 *
 * The `.pdfjs` extension is registered as a Metro asset extension in
 * `metro.config.js`, so `require('....pdfjs')` returns a numeric asset module id
 * (the same shape Metro uses for images/fonts). We declare it here so the
 * provider can `require()` the bundles under strict TypeScript without `any`.
 */
declare module '*.pdfjs' {
  const assetModuleId: number;
  export default assetModuleId;
}
