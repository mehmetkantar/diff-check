import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// One self-contained ES module (React, the engine, the pdf.js worker, styles and fonts included),
// so a host page only needs <script type="module" src="redline-element.js">.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: {
    alias: [
      { find: /^@redline\/core$/, replacement: at('../core/src/index.ts') },
      { find: /^@redline\/react$/, replacement: at('../react/src/index.ts') },
      { find: /^@redline\/ocr$/, replacement: at('../ocr/src/index.ts') },
    ],
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    lib: { entry: 'src/index.tsx', formats: ['es'], fileName: () => 'redline-element.js' },
    chunkSizeWarningLimit: 6000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
