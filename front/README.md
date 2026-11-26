# Frontend — Atmospheric Analyst

Interfaz web del tracker de precios: **Astro 7** con salida estática e **islas de React 19** donde hay interacción. Diseño «Consola» (Geist y Geist Mono, blanco y negro con bordes de 1 px, claro y oscuro). Toda la interfaz está en español de España.

En producción **no hay servidor de frontend**: `npm run build` genera `front/dist` (una carpeta por página: `/entrar` → `entrar/index.html`, más `404.html`) y FastAPI lo sirve en el mismo origen que la API (ver D3 y D12 en [`docs/DECISIONES.md`](../docs/DECISIONES.md)). El contrato con el backend está en [`docs/API.md`](../docs/API.md).

## Desarrollo

Necesitas Node 22.23.4 o posterior y el backend arrancado (`docker compose up -d` lo deja en `http://127.0.0.1:8001`).

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

Astro (Vite por debajo) reenvía `/api` al backend, así que el navegador ve un único origen y las cookies de sesión y la cabecera CSRF funcionan igual que en producción. Si el backend está en otro sitio:

```bash
VITE_DEV_API_TARGET=http://127.0.0.1:8000 npm run dev
```

Usa `127.0.0.1` y no `localhost`: en Windows, `localhost` prueba antes IPv6 y pierde ~200 ms por conexión.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con proxy de `/api`. |
| `npm run build` | `astro build` y después `scripts/csp-hashes.mjs`, que escribe `dist/csp-hashes.json` con el sha256 de cada `<script>` en línea (el backend los añade a `script-src`). |
| `npm run check` / `npm run lint` | `astro check` (tipos de `.astro`, `.ts` y `.tsx`). |
| `npm test` | Vitest con Testing Library (jsdom). |
| `npm run preview` | Sirve `dist/` en `http://127.0.0.1:4321`, también con proxy de `/api`. |

## Estructura

```
public/           theme.js (tema antes de pintar, síncrono en <head>) y favicon
scripts/          csp-hashes.mjs
src/
  pages/          una ruta de Astro por página: index, producto, lecturas, alertas, ajustes, admin,
                  entrar, registro, verificar, recuperar, restablecer y 404
  layouts/        BaseLayout (fuentes, tema, ClientRouter), AppLayout (barra lateral), AuthLayout
  islands/        una isla de React por página (client:only, con su esqueleto estático de respaldo)
  components/     barra lateral, gráfica SVG, tarjetas, diálogos, formularios, iconos SVG
  api/            cliente HTTP (cookies, CSRF, una sola renovación en 401, errores tipados) y una función por endpoint
  lib/            caché en memoria (stale-while-revalidate), sesión, formatos, escalas y huecos de la gráfica,
                  cambios de las lecturas, veredicto de precio…
  styles/         global.css: tokens de color en :root con variantes oscuras (prefers-color-scheme y [data-theme])
```

## Cómo funciona

- **Navegación:** `<ClientRouter />` cambia de página sin recargar. La barra lateral persiste (`transition:persist`) y la caché de `lib/cache.ts` sobrevive entre páginas: al volver al panel se pinta al instante y se refresca por detrás.
- **Sesión:** cada página privada comprueba `/api/auth/me` (con la caché, sin esperar si ya se conoce). Sin sesión va a `/entrar?next=…`; mientras tanto se ve el esqueleto.
- **CSP:** nada de scripts en línea propios. Los únicos en línea son los de arranque de las islas que genera Astro, y van con hash en `dist/csp-hashes.json`.
- **Peso:** la página `/` carga menos de 95 KB de JavaScript con gzip (hoy 92,3 KB; 64 KB son react-dom). Los diálogos y la vista de lista se descargan al usarlos; las fotos de producto, solo cuando se ven.
- **Sin dependencias de interfaz:** ni Tailwind ni librerías de iconos ni de gráficas; CSS propio, iconos SVG en línea y gráfica SVG propia.
