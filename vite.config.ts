import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'esnext',
    minify: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@uiw') || id.includes('@codemirror') || id.includes('yaml')) {
              return 'vendor-codemirror';
            }
            if (id.includes('@xterm')) {
              return 'vendor-xterm';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('semver') || id.includes('fuse.js')) {
              return 'vendor-utils';
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
