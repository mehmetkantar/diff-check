import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The demo consumes the workspace packages from source, so no library build is needed in development.
//   npm run dev                -> http://localhost:5173
//   npm run build              -> dist/          (any static server, see deploy/)
//   npm run build:single       -> dist-single/index.html (one self-contained file, opens from disk)
// OCR assets (about 17 MB of WebAssembly and language data) are copied to public/ocr before each run and
// served as plain files next to index.html; they are never inlined, not even in the single-file build.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: {
    alias: [
      { find: '@redline/react/styles.css', replacement: at('../../packages/react/src/styles.css') },
      { find: '@redline/react/fonts.css', replacement: at('../../packages/react/src/fonts.css') },
      { find: /^@redline\/core$/, replacement: at('../../packages/core/src/index.ts') },
      { find: /^@redline\/react$/, replacement: at('../../packages/react/src/index.ts') },
      { find: /^@redline\/ocr$/, replacement: at('../../packages/ocr/src/index.ts') },
    ],
  },
  worker: { format: 'es' },
  server: { fs: { allow: [at('../../')] } },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
}));
