import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the BFF so the browser only ever sees one origin
// (and the Anthropic key stays server-side). The target is configurable via
// VITE_BFF_URL in web/.env.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const bff = env.VITE_BFF_URL || 'http://localhost:3001';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: bff, changeOrigin: true } },
    },
    build: { outDir: 'dist' },
  };
});
