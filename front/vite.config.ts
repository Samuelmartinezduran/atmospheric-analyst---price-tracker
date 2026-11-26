import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {loadEnv} from 'vite';
import {defineConfig} from 'vitest/config';

export default defineConfig(({mode}) => {
  // En desarrollo, Vite reenvía /api al backend para que el navegador vea un solo
  // origen: las cookies SameSite y la cabecera CSRF funcionan igual que en
  // producción, donde FastAPI sirve este build (ver D3 en docs/DECISIONES.md).
  // Se acepta la variable del entorno o de front/.env.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget =
    process.env.VITE_DEV_API_TARGET || env.VITE_DEV_API_TARGET || 'http://localhost:8001';
  const proxy = {'/api': {target: apiTarget, changeOrigin: false}};

  return {
    plugins: [react(), tailwindcss()],
    server: {proxy},
    preview: {proxy},
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
    },
  };
});
