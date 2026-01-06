import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Vite + React chosen over Next.js because we do not need
// server-side rendering or API routes for a fully local app.
// It yields a smaller bundle, faster dev reloads, and simpler
// static deployment to any server.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Use relative paths for GitHub Pages artifact-based deployment
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  worker: {
    format: 'es',
    rollupOptions: { output: { format: 'es' } }
  },
  build: {
    target: 'es2020'
  }
});
