import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds into the service's static directory (served with a strict CSP).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') }, dedupe: ['react', 'react-dom'] },
  build: { outDir: '../src/dashboard/public', emptyOutDir: true },
  // Local dev: proxy service paths to Convex HTTP actions (AGILEFLOW_API_URL, e.g. http://127.0.0.1:3211),
  // or to the Node service on :8787.
  server: { proxy: Object.fromEntries(['/api', '/dev', '/.well-known'].map((p) => [p, { target: process.env.AGILEFLOW_API_URL ?? 'http://localhost:8787', changeOrigin: true }])) },
});
