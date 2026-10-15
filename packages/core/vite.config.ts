import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const node = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

// Library build. Dependencies stay external so the host's bundler dedupes them;
// the pdf.js worker is the exception and is inlined (see parsers/pdf-worker.ts).
export default defineConfig({
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: { entry: { index: 'src/index.ts', cli: 'src/cli.ts' }, formats: ['es'] },
    rollupOptions: {
      external: (id) =>
        node.has(id) || /^(diff|jszip|docx|@xmldom\/xmldom)(\/|$)/.test(id) || (/^pdfjs-dist(\/|$)/.test(id) && !id.includes('?worker')),
      output: { banner: (chunk) => (chunk.name === 'cli' ? '#!/usr/bin/env node' : '') },
    },
  },
});
