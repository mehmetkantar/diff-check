import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Library build: React and @redline/core stay external; CSS is emitted as dist/redline.css.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Vite 8 needs CSS lib entries split; each entry becomes its own stylesheet.
    cssCodeSplit: true,
    lib: {
      entry: { index: 'src/index.ts', redline: 'src/styles.css', fonts: 'src/fonts.css' },
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => /^(react|react-dom|react\/jsx-runtime|@redline\/core|@phosphor-icons\/react)(\/|$)/.test(id),
      output: { assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? '[name][extname]' : 'assets/[name]-[hash][extname]') },
    },
  },
});
