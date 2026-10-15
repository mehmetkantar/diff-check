import { defineConfig } from 'vite';

// Library build. tesseract.js stays external: the host bundler includes its small main-thread part,
// while the worker, WebAssembly core and language data are served as static files (bin/redline-ocr-assets.mjs).
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: (id) => /^(tesseract\.js|@redline\/core)(\/|$)/.test(id) },
  },
});
