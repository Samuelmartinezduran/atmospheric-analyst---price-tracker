# Frontend — Atmospheric Analyst

Interfaz web del tracker de precios: React 19, Vite, Tailwind CSS v4 y `react-router` 7 (modo librería). Toda la interfaz está en español de España.

En producción **no hay servidor de frontend**: `npm run build` genera `front/dist` y FastAPI lo sirve en `/` junto a la API en `/api`, en el mismo origen (ver D3 y D11 en [`docs/DECISIONES.md`](../docs/DECISIONES.md)). El contrato con el backend está en [`docs/API.md`](../docs/API.md).

## Desarrollo

Necesitas Node 20.19 o posterior y el backend arrancado (por defecto, `docker compose up -d` lo deja en `http://localhost:8001`).

```bash
npm install
npm run dev        # http://localhost:5173
```

Vite reenvía `/api` al backend, así que el navegador ve un único origen y las cookies de sesión y la cabecera CSRF funcionan igual que en producción. Si el backend está en otro sitio:

```bash
VITE_DEV_API_TARGET=http://localhost:8000 npm run dev
```

(También puedes ponerlo en `front/.env`; mira `.env.example`.) No hay ninguna variable para producción: el cliente usa rutas relativas.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con proxy de `/api`. |
| `npm run build` | Comprueba los tipos y compila a `dist/`. |
| `npm run lint` | `tsc --noEmit`. |
| `npm test` | Tests con Vitest y Testing Library. |
| `npm run preview` | Sirve `dist/` en local (también con proxy de `/api`). |

## Estructura

```
src/
  api/          cliente HTTP (cookies, CSRF, renovación única en 401, errores tipados) y una función por endpoint
  auth/         contexto de sesión y guardas de rutas
  layouts/      marco de la aplicación (barra lateral, menú móvil) y de las pantallas de acceso
  pages/        una página por ruta
  components/   piezas reutilizables (modal accesible, avisos, tarjetas, gráfica…)
  lib/          formatos es-ES, estado de producto, «¿es buen precio?», tema oscuro…
```

## Rutas

| Ruta | Pantalla |
|---|---|
| `/entrar`, `/registro` | Acceso y alta |
| `/verificar?token=` | Verifica el email (sola si llega el token) |
| `/recuperar`, `/restablecer?token=` | Pedir enlace y elegir contraseña nueva |
| `/` y `/productos/:id` | Panel y detalle de un producto |
| `/alertas`, `/ajustes` | Historial de alertas y ajustes de la cuenta |

Los enlaces antiguos de los emails (`/?verify_token=…` y `/?reset_token=…`) redirigen a las rutas nuevas. Como es una SPA, el backend debe devolver `index.html` para cualquier ruta que no empiece por `/api` ni sea un fichero de `dist/`.
