/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri espera el servidor de desarrollo en un puerto fijo.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    // WebView2 (Windows) es Chromium moderno.
    target: 'chrome120',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
