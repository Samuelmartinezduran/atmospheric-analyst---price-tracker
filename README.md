# Lowmark

Tracker de precios para **Amazon ES** y **PCComponentes**. El nombre viene de la *low-water mark*, la raya que se pinta en los muelles donde llega el agua en la marea más baja: la app marca el mínimo de cada producto y te avisa cuando el precio baja de tu objetivo.

 Pegas el enlace de un producto y el precio que estás dispuesto a pagar. La app lo comprueba cada pocas horas, guarda el historial, te dice si el precio actual es bueno comparado con su mínimo y con la media del último mes, y te manda un email cuando baja de tu objetivo.

Empezó como mi primer proyecto (marzo de 2026) y en noviembre lo rehíce entero tras una revisión a fondo. La [revisión](docs/REVISION-2026-11.md) y las [decisiones de arquitectura](docs/DECISIONES.md) están documentadas, con los fallos reales que tenía y cómo se resolvieron.

## Cómo funciona

```
            ┌───────────────────────── una imagen Docker ─────────────────────────┐
 navegador ─┤ web:    FastAPI  ── /api/*  ──┐                                      │
            │                  ── /*  → frontend React compilado (mismo origen)    │
            │                               ├── PostgreSQL 16                      │
            │ worker: cada minuto busca     │   (bloqueos consultivos para que     │
            │         productos pendientes ─┘    web y worker no se pisen)         │
            │         ↳ Chromium (Playwright) → Amazon ES / PCComponentes          │
            │         ↳ precio → crate de Rust `precio` (PyO3)                     │
            │         ↳ alertas → SMTP, con reintentos                             │
            └─────────────────────────────────────────────────────────────────────┘
```

- **Backend:** Python 3.10, FastAPI, SQLAlchemy 2, Alembic, Playwright.
- **Parser de precios:** Rust (PyO3 + maturin), con tests de propiedades (`proptest`).
- **Frontend:** Astro 7 con islas de React 19, CSS propio y gráficas en SVG; 89 KB de JavaScript comprimido en la portada.
- **Infraestructura:** Docker Compose (db, web y worker con la misma imagen) y GitHub Actions.

Algunas decisiones que quizá sorprendan, explicadas en [`docs/DECISIONES.md`](docs/DECISIONES.md):

- **Sin n8n.** Solo hacía un cron y llamaba a tres endpoints, y llevaba ocho meses sin ejecutar nada sin que nadie se diera cuenta. Lo sustituye un worker propio, con tests.
- **Mismo origen.** El frontend en Vercel con la API en otro dominio no podía funcionar con cookies `SameSite` y CSRF, así que FastAPI sirve el build.
- **Rust solo en el parser de precios.** Es una función pura y es justo donde un error cuesta caro: el parser antiguo leía «2.499€» como 2,50 €.

## Arrancarlo

Solo hace falta Docker.

```bash
cp .env.example .env
# Rellena POSTGRES_PASSWORD y AUTH_JWT_SECRET (el propio fichero dice cómo generarlos).
docker compose up -d --build
```

Abre <http://localhost:8001> y crea una cuenta. Para tener el panel de administración (estado del worker, cuentas registradas), da el rol a tu cuenta (o créala) con `docker compose exec web python -m app.cli crear-admin tu@email.com`; si no indicas `--password`, genera una contraseña y la muestra una vez. Sin correo configurado (`EMAIL_ENABLED=false`) y con `APP_ENV=dev`, el token de verificación aparece en la propia pantalla.

Para recibir las alertas por email, rellena el bloque `SMTP_*` del `.env` (en Gmail, con una contraseña de aplicación) y pon `EMAIL_ENABLED=true`.

| Comando | Para qué |
|---|---|
| `docker compose logs -f worker` | Ver las rondas de comprobación |
| `docker compose run --rm worker python -m app.worker --once` | Forzar una ronda ahora |
| `docker build --target test -t atmospheric-analyst:test . && docker run --rm atmospheric-analyst:test` | Tests del backend (la build también pasa los de Rust) |
| `cd front && npm install && npm run dev` | Frontend con recarga en caliente en :5173 (proxy de `/api` a :8001) |

La documentación interactiva de la API está en <http://localhost:8001/api/docs> (solo en `dev`). El contrato está en [`docs/API.md`](docs/API.md).

## Qué hace bien (y qué no)

- **Lee bien los precios.** Cada scraper indica si el texto viene de datos estructurados (`1099.95`) o de la página en español (`1.099,95 €`), y lo ambiguo se rechaza en lugar de adivinarse.
- **No abre cualquier URL.** Solo dominios exactos de las tiendas, sin puertos ni credenciales, y comprueba adónde redirige la página.
- **No repite avisos.** Avisa cuando el precio cruza tu objetivo hacia abajo, no en cada comprobación, y un bloqueo puntual de Amazon no genera un email repetido.
- **Amazon pide captcha a veces.** La app lo detecta, lo registra como error y reintenta en la siguiente ronda. Si se vuelve constante, admite un proxy (`SCRAPER_PROXY_SERVER`).
- **Es para uso personal.** Scrapear Amazon va contra sus condiciones de uso; un servicio público debería usar su API oficial de productos.
