// The engine optionally loads the pdf.js worker via a bundler `?url` import
// (Vite/webpack resolve this to the built asset URL). Standalone `tsc` has no
// `vite/client` ambient types, so declare just this one module for the
// declaration build. The import is wrapped in try/catch at runtime, so
// non-bundler consumers simply fall back to pdf.js's main-thread worker.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string;
  export default src;
}
