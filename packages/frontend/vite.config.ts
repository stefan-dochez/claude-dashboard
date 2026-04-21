import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // esbuild minifier strips the outer `var V;` of transpiled `const enum`
  // declarations while keeping the IIFE that references it, producing runtime
  // ReferenceErrors (notably xterm's `requestMode`/DECRQM handler). Terser
  // does not do this aggressive DCE and keeps the binding intact.
  build: { minify: 'terser' },
  server: {
    proxy: {
      '/api': 'http://localhost:3200',
      '/socket.io': {
        target: 'http://localhost:3200',
        ws: true,
      },
    },
  },
});
