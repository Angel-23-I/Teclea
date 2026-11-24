/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// La misma política de seguridad (CSP) que la app de escritorio, para probarla con `vite preview`.
const tauriConf = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
) as {
  app: { security: { csp: Record<string, string> } };
};
const csp = Object.entries(tauriConf.app.security.csp)
  .map(([k, v]) => `${k} ${v}`)
  .join('; ');

// Tauri espera el servidor de desarrollo en un puerto fijo.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  preview: {
    port: 1421,
    headers: { 'Content-Security-Policy': csp },
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
