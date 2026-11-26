# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code (o cualquier agente).

## Qué es

Tracker de precios personal para **Amazon ES** y **PCComponentes**: guarda el historial, enseña si un precio es bueno y manda un email cuando baja del objetivo. Interfaz en español.

Antes de cambiar la arquitectura, lee `docs/DECISIONES.md`: explica por qué es así (FastAPI y no Django, sin n8n, mismo origen, Rust solo en el parser). `docs/REVISION-2026-11.md` lista los fallos que se corrigieron; no los reintroduzcas. `docs/API.md` es el contrato entre el backend y el frontend.

## Estructura

```
backend/app/
  main.py               API + sirve el frontend compilado (mismo origen)
  worker.py             bucle de comprobaciones y envío de alertas (sustituye a n8n)
  core/config.py        TODA la configuración, con valores por defecto y validación
  api/routes/           auth, products (+ stores, jobs), alerts, health
  services/             price_check (reglas de alerta + bloqueos), alert (reintentos),
                        email, product (stats), auth, auth_throttle
  scrapers/             urls.py (allowlist/SSRF + URLs canónicas), prices.py (adaptador del crate),
                        base.py (BrowserSession compartido), amazon.py, pccomponentes.py
backend/alembic/        migraciones (se aplican solas al arrancar, con bloqueo)
backend/tests/          unit/ e integration/ (SQLite en memoria, sin navegador)
precio/                 crate de Rust: parser de precios + enlace PyO3
front/                  React 19 + Vite + Tailwind v4 + react-router
```

## Comandos

Todo pasa por Docker; no hace falta Python, Rust ni Postgres en el PC.

```bash
docker compose up -d --build            # db + web (http://localhost:8001) + worker
docker compose logs -f worker           # ver las rondas de comprobación
docker compose run --rm worker python -m app.worker --once   # una ronda a mano

# Tests y lint del backend (la build ejecuta también `cargo test` del crate)
docker build --target test -t atmospheric-analyst:test .
docker run --rm atmospheric-analyst:test                      # pytest
docker run --rm atmospheric-analyst:test ruff check app tests alembic
docker run --rm atmospheric-analyst:test ruff format --check app tests alembic

# Frontend en caliente (con la API en Docker)
cd front && npm install && npm run dev    # http://localhost:5173, proxy de /api a :8001
npm run lint && npm test && npm run build
```

Nueva migración: `docker compose run --rm web alembic revision -m "descripcion"` y escribirla a mano (revisa siempre lo que genera `--autogenerate`).

## Reglas que no hay que romper

- **Precios:** cada scraper indica el formato (`PriceFormat.MACHINE` para JSON-LD y metaetiquetas, `PriceFormat.ES` para texto visible). Nunca adivinar. La lógica está en `precio/src/lib.rs`; si cambia, añade el caso a los tests de Rust **y** a `tests/unit/test_prices.py`.
- **URLs:** todo lo que se abre con el navegador pasa antes por `normalize_product_url`. Nunca comprobar dominios con `"x" in url`.
- **Alertas:** un error de lectura no toca `was_below_desired`; quedarse sin stock sí. Ver `services/price_check_service.py`.
- **Configuración:** una variable nueva va en `core/config.py` y en `.env.example`. No repetir valores por defecto en `docker-compose.yml`.
- **Secretos:** nada de valores por defecto que funcionen fuera de `APP_ENV=dev`.
- **Idioma:** identificadores en inglés; comentarios, docstrings, mensajes de error y toda la interfaz en español con tildes.

## Añadir una tienda

1. `StoreInfo` nuevo en `scrapers/urls.py`, con sus dominios exactos y su regla de URL canónica.
2. Un scraper que herede de `BaseStoreScraper`, registrado en `scrapers/__init__.py`. Usa el JSON-LD si la tienda lo tiene.
3. Tests de parseo con HTML mínimo en `tests/unit/test_scrapers.py` y de URL en `test_urls.py`.
