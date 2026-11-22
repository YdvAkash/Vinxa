import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'detector-content': resolve(__dirname, 'src/content/detector-content.ts'),
        'offscreen': resolve(__dirname, 'offscreen.html')
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'service-worker') return 'src/background/service-worker.js';
          if (chunk.name === 'detector-content') return 'src/content/detector-content.js';
          return 'assets/[name]-[hash].js';
        }
      }
    }
  }
});
