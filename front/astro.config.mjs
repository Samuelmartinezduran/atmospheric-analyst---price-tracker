// @ts-check
import react from '@astrojs/react';
import {defineConfig} from 'astro/config';

// Salida estática que sirve FastAPI en el mismo origen que la API (D3 y D12 en docs/DECISIONES.md).
// `/entrar` → `dist/entrar/index.html`; lo que no existe → `dist/404.html` con estado 404.
//
// En desarrollo, Vite reenvía /api al backend para que el navegador vea un solo origen: las
// cookies SameSite y la cabecera CSRF funcionan igual que en producción. Se usa 127.0.0.1 y no
// localhost: en Windows, localhost prueba antes ::1 y pierde ~200 ms por conexión.
const apiTarget = process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8001';
const proxy = {'/api': {target: apiTarget, changeOrigin: false}};

export default defineConfig({
  output: 'static',
  outDir: './dist',
  trailingSlash: 'ignore',
  build: {format: 'directory'},
  integrations: [react()],
  devToolbar: {enabled: false},
  // Sin precarga: el HTML de cada página es mínimo (los datos salen de la caché en memoria) y así
  // el panel no carga 1 KB más de JavaScript (presupuesto de 90 KB con gzip).
  prefetch: false,
  vite: {
    server: {proxy},
    preview: {proxy},
    build: {
      // Sin el ayudante de precarga de Vite: los import() son pocos (diálogos) y así pesa menos.
      modulePreload: false,
      rollupOptions: {
        output: {
          // El código compartido (cliente de la API, sesión, caché, formatos, barra lateral y piezas
          // comunes) va en un solo fichero: comprime mejor que una docena de trozos pequeños.
          manualChunks(id) {
            const path = id.replaceAll('\\', '/');
            // Lo que solo usa una página (veredicto, sesiones, tema, gráfica grande, importes, tiempo relativo, administración, tiendas) se queda en la suya.
            if (/\/src\/lib\/(priceVerdict|userAgent|theme|chart|priceInput|relativeTime)\.ts$/.test(path)) return undefined;
            if (/\/src\/api\/(admin|stores)\.ts$/.test(path)) return undefined;
            if (/\/src\/(lib|api)\//.test(path)) return 'app';
            if (/\/src\/components\/(ui|icons|Sidebar|PrivatePage|skeletons)\.tsx$/.test(path)) return 'app';
            return undefined;
          },
        },
      },
    },
  },
});
