# API

Todo cuelga de `/api` en el mismo origen que el frontend (ver D3 en `DECISIONES.md`). La documentación interactiva generada está en `/docs` cuando `APP_ENV=dev`.

## Convenciones

- Cuerpos en JSON. Importes como números con dos decimales (`1099.95`), siempre en EUR.
- Fechas en ISO 8601 con zona horaria (UTC).
- Errores: `{"detail": "mensaje en español"}`. Los errores de validación de FastAPI (422) traen `detail` como lista; el cliente debe mostrar un mensaje genérico en ese caso.
- Sesión por cookies `httpOnly` (`access_token` 15 min, `refresh_token` 30 días). Si una petición devuelve 401, el cliente llama una vez a `POST /api/auth/refresh` y repite la petición.
- **CSRF:** en toda petición `POST`/`PATCH`/`PUT`/`DELETE` con sesión, enviar la cabecera `X-CSRF-Token` con el valor de la cookie `csrf_token` (legible desde JS).

## Autenticación — `/api/auth`

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/register` | `{email, password}` (contraseña ≥ 12) | 201 `{message, debug_token}`. Mensaje uniforme exista o no la cuenta. `debug_token` solo en `dev`. |
| POST | `/verify-email` | `{token}` | 200 `{message}` · 400 token inválido o caducado |
| POST | `/resend-verification` | `{email}` | 200 `{message, debug_token}` · 429 demasiados intentos |
| POST | `/login` | `{email, password}` | 200 `{user}` y cookies · 401 credenciales inválidas · **403 email sin verificar** · 429 |
| POST | `/refresh` | — | 200 `{user}` y cookies nuevas · 401 |
| POST | `/logout` | — | 200 `{message}` |
| GET | `/me` | — | 200 `User` · 401 |
| POST | `/change-password` | `{current_password, new_password}` | 200 `{message}` · 400 si la actual no es correcta (nunca 401). Cierra las demás sesiones; la actual sigue con sus cookies. |
| POST | `/forgot-password` | `{email}` | 200 `{message, debug_token}` (mensaje uniforme) · 429 |
| POST | `/reset-password` | `{token, new_password}` | 200 `{message}` · 400 |
| GET | `/sessions` | — | 200 `{sessions: Session[]}` (solo las no revocadas) |
| POST | `/sessions/revoke-others` | — | 200 `{message, revoked_count}` |

`User`: `{id, email, is_email_verified, is_active, is_admin, created_at}`
`Session`: `{id, ip_address, user_agent, expires_at, revoked_at, created_at, is_current}`

El único 403 posible en `/login` es «email sin verificar»: la comprobación CSRF solo se aplica con sesión abierta. Los 429 traen `Retry-After` en segundos. `debug_token` es `null` fuera de `dev`.

Los emails llevan enlaces a `/verificar?token=…` y `/restablecer?token=…`.

## Tiendas — `/api/stores`

`GET /api/stores` → `[{code, name, domains, example_url}]`. Hoy: `amazon_es` (Amazon ES) y `pccomponentes` (PCComponentes).

## Productos — `/api/products`

`Product`:

```json
{
  "id": 12,
  "url": "https://www.pccomponentes.com/tarjeta-grafica-...",
  "store": "pccomponentes",
  "title": "ASUS Dual GeForce RTX 5070 OC 12GB",
  "image_url": "https://...",
  "desired_price": 600.0,
  "last_price": 649.0,
  "previous_price": 659.0,
  "currency": "EUR",
  "last_status": "ok",          // never_checked | ok | unavailable | error
  "last_error": null,
  "last_checked_at": "2026-11-26T10:00:00Z",
  "is_below_target": false,
  "stats": {
    "lowest_price": 629.0,
    "lowest_price_at": "2026-04-01T17:10:04Z",
    "highest_price": 699.0,
    "avg_price_30d": 655.2,
    "checks_count": 41
  },
  "spark": [["2026-03-24T10:00:00Z", 659.0], ["2026-04-01T17:10:04Z", 649.0]],
  "created_at": "...",
  "updated_at": "..."
}
```

`spark` son las últimas 30 lecturas con precio, en orden cronológico, para la minigráfica sin pedir el historial. `stats` siempre es un objeto; sus campos pueden ser `null` si aún no hay precios. `lowest_price` y `highest_price` son de todo el historial; `avg_price_30d`, de los últimos 30 días; `checks_count` cuenta solo las comprobaciones con precio (las fallidas y sin stock no).

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/products` | — | 200 `Product[]` (más recientes primero) |
| GET | `/api/products/{id}` | — | 200 `Product` · 404 |
| POST | `/api/products` | `{url, desired_price}` | 201 `Product` (nuevo; ya trae la primera comprobación) · 200 si ya existía (se actualiza el objetivo) · 400 URL no soportada |
| PATCH | `/api/products/{id}` | `{desired_price?}` | 200 `Product` · 404 |
| DELETE | `/api/products/{id}` | — | 204 (borra también su historial y sus alertas) · 404 |
| GET | `/api/products/{id}/history` | — | 200 `HistoryPoint[]` (orden cronológico) |
| POST | `/api/products/{id}/check` | — | 200 `CheckSummary` · 404 · 409 si ya se está comprobando |
| POST | `/api/jobs/check-now` | — | 200 `CheckSummary` (todos los productos del usuario) |

`HistoryPoint`: `{id, product_id, price, currency, status, error_message, checked_at}` (`price` es `null` si la comprobación falló)
`CheckSummary`: `{total_products, checked_ok, checked_failed, alerts_created, skipped}`

## Alertas — `/api/alerts`

`GET /api/alerts` → `Alert[]` (más recientes primero, máximo 200)

`Alert`: `{id, product_id, product_title, product_url, desired_price, triggered_price, currency, status, attempts, error_message, triggered_at, sent_at}` con `status` ∈ `pending | sent | failed`.

## Administración — `/api/admin` (solo `is_admin`; 403 para el resto)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/overview` | `{totals, last_check_at, email_enabled, check_interval_minutes, users}`: totales de cuentas, productos, lecturas de las últimas 24 h y alertas por estado; y por cuenta, sus productos y su último acceso. |
| DELETE | `/users/{id}` | 204 (borra la cuenta y, en cascada, sus productos, historial, alertas y sesiones) · 400 si es tu propia cuenta · 404 |

El rol no se concede desde la API: `docker compose exec web python -m app.cli crear-admin tu@email.com`.

## Resumen y lecturas (columna izquierda del panel)

`GET /api/summary` →

```json
{
  "products": {"total": 6, "below_target": 1, "above_target": 3, "unavailable": 2, "error": 0, "never_checked": 0},
  "alerts": {"pending": 0, "sent": 2, "failed": 3},
  "expected_checks_24h": 24,
  "checks_24h": 6,
  "failed_checks_24h": 0,
  "last_check_at": "2026-11-26T19:21:18Z",
  "next_check_at": "2026-11-27T01:21:18Z",
  "check_interval_minutes": 360,
  "email_enabled": true
}
```

Solo cuenta los productos activos del usuario. `next_check_at` es cuándo le toca al producto que lleva más tiempo sin comprobarse (si hay alguno sin comprobar, ahora mismo); `null` sin productos.

`GET /api/readings?limit=20&product_id=12` → `Reading[]`, más recientes primero (`limit` de 1 a 200; `product_id` opcional, 404 si no es tuyo).

`Reading`: `{id, product_id, product_title, store, price, previous_price, desired_price, status, error_message, checked_at}`. `previous_price` es el precio de la lectura correcta anterior de ese producto (para mostrar subidas y bajadas); `price` es `null` si la lectura falló o no había stock.

## Salud

`GET /api/health` → `{"status": "ok"}`
