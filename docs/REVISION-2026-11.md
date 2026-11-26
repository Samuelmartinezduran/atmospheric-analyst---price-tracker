# Revisión del 26 de noviembre de 2026

Revisión completa del MVP de marzo-abril de 2026 (el primer proyecto de Samuel) y lo que se hizo con cada hallazgo. Las decisiones de arquitectura que salen de aquí están razonadas en [`DECISIONES.md`](DECISIONES.md).

**Cómo se revisó:** lectura completa del código; los 41 tests de entonces (pasaban); `tsc` y `npm audit` del frontend; los dos scrapers lanzados contra las tiendas reales; y la base de datos que estaba en marcha en Docker.

**Leyenda:** ✅ arreglado · 🔁 sustituido por otra solución · 📝 documentado / pendiente

---

## Críticos

| # | Hallazgo | Prueba | Estado |
|---|---|---|---|
| C1 | **El parser de precios leía «2.499€» como 2,50 € y «1.234 €» como 1,23 €.** Un precio sin céntimos disparaba alertas falsas de chollo. | Ejecutado en el contenedor de entonces. | ✅ `scrapers/prices.py` distingue el formato de datos del texto en español (D6). Hay tests de regresión. |
| C2 | **La automatización llevaba ocho meses parada.** n8n 2.x no tenía ningún workflow publicado: el diario no llegó a importarse y los dos venían con `active: false`. La última comprobación era del 01/04/2026 y había 3 alertas pendientes desde marzo. | `n8n list:workflow`, logs de n8n y consultas a la base de datos. | 🔁 Sin n8n: worker propio (D2). Las 3 alertas de marzo se marcaron como caducadas para no enviar precios de hace ocho meses. |
| C3 | **Se podía tomar cualquier cuenta.** `AUTH_ENABLE_DEBUG_TOKENS=true` por defecto devolvía el token de recuperación en la respuesta de «olvidé mi contraseña». Además, `AUTH_JWT_SECRET` no estaba en el `.env`, así que se usaba `change-me-super-secret`, que es público. | Configuración y `.env`. | ✅ Los tokens de depuración solo funcionan con `APP_ENV=dev`; fuera de `dev` la app no arranca con secretos de ejemplo (D8). El `.env` nuevo tiene secretos aleatorios. |
| C4 | **SSRF.** `"amazon.es" in url` aceptaba `http://169.254.169.254/?x=amazon.es`, y el servidor abría con Chromium cualquier dirección interna. | Probado en el contenedor. | ✅ Validación por host exacto, sin puertos ni credenciales, y comprobación de la URL final tras las redirecciones (D7). |
| C5 | **El despliegue en Vercel no podía funcionar.** Con el frontend y la API en dominios distintos, las cookies `SameSite=Lax` no viajan y la cookie CSRF no se puede leer. | Análisis del flujo de cookies. | 🔁 Un solo origen: FastAPI sirve el frontend (D3). Vercel se ha quitado. |

## Lógica

| # | Hallazgo | Estado |
|---|---|---|
| L1 | **Alertas repetidas:** cada error de lectura reiniciaba `was_below_desired`. Los datos reales lo confirman: dos alertas del mismo iPhone el 15 y el 16 de marzo. | ✅ Un error ya no cambia el estado; quedarse sin stock sí lo reinicia (D9). |
| L2 | Cambiar el precio objetivo no recalculaba si el precio ya estaba por debajo. | ✅ `set_desired_price` lo recalcula con el último precio. |
| L3 | Un usuario sin verificar con la contraseña correcta veía «credenciales inválidas». | ✅ Responde 403 con un mensaje claro y no cuenta como intento fallido. |
| L4 | Los enlaces de los emails (`/?verify_token=`, `/?reset_token=`) no hacían nada y no había pantalla de recuperación de contraseña. | ✅ Rutas `/verificar` y `/restablecer` en el frontend; las URLs antiguas redirigen. |
| L5 | Sin sesión, la primera visita mostraba «La sesión expiró». | ✅ Las rutas privadas redirigen a `/entrar`. |
| L6 | El mismo producto con otro `?ref=` contaba como producto distinto. | ✅ URLs canónicas (Amazon por ASIN); la migración 0004 normaliza las existentes. |
| L7 | `X-Forwarded-For` se aceptaba sin más, y con eso cualquiera se saltaba el límite de intentos. | ✅ Solo con `TRUST_PROXY_HEADERS=true`. |
| L8 | Registrar un email existente devolvía 409, lo que revelaba qué emails tienen cuenta. | ✅ El mensaje es el mismo exista o no. También se iguala el tiempo de respuesta del login. |
| L9 | En PCComponentes ningún selector CSS funcionaba: solo lo salvaba el JSON-LD. Además, «no disponible» en cualquier parte de la página la marcaba sin stock y la disponibilidad del JSON-LD se ignoraba. Comprobado el 26/11: la RTX 5070 seguida salía «en stock a 1.099,95 €» cuando la tienda la marca `OutOfStock` y no tiene botón de compra. | ✅ El JSON-LD es la fuente principal, incluida la disponibilidad; `#pdp-price-current-integer` queda de respaldo (es lo que lee la página del iPhone, que no trae JSON-LD de producto). |
| L10 | En Amazon se cogía el primer `span.a-price` de la página, que podía ser el de un producto recomendado. | ✅ Solo se mira dentro de la caja de compra; el captcha se detecta como bloqueo. |
| L11 | Un título con saltos de línea rompía el asunto del email. | ✅ El asunto se limpia antes de enviar. |

## Arquitectura y rendimiento

| # | Hallazgo | Estado |
|---|---|---|
| A1 | Se lanzaba un Chromium nuevo por producto y por reintento. | ✅ Un navegador por ronda y un contexto por página. |
| A2 | La comprobación global repasaba los productos de todos los usuarios dentro de una petición HTTP con un único commit: un fallo lo perdía todo, y con unos 50 productos se agotaba el tiempo de espera de n8n. | ✅ El worker procesa los productos pendientes por lotes, con una transacción por producto. |
| A3 | Una comprobación manual y el cron a la vez duplicaban alertas. | ✅ Bloqueo consultivo de Postgres por producto; la API responde 409 si ya se está comprobando. |
| A4 | Cuatro servicios, unas 50 variables triplicadas y valores inseguros por defecto (`supersecreto`, `Admin1234!`, `replace-me`). | ✅ Tres servicios, una imagen, un `.env.example`; compose exige `POSTGRES_PASSWORD`. |
| A5 | Postgres en `0.0.0.0:5433`, accesible desde toda la red local. | ✅ Solo `127.0.0.1`. |
| A6 | CORS `*` con cookies si no se configuraba nada. | ✅ Sin CORS: mismo origen. |
| A7 | Un `ALTER TABLE` a mano en `init_db.py`, fuera de Alembic. | ✅ Quitado; las migraciones se aplican con un bloqueo para que la API y el worker no choquen. |
| A8 | Imagen de n8n sin versión fijada; cambió sola a la 2.x. | 🔁 Sin n8n; el resto de imágenes llevan versión fija. |
| A9 | Las alertas no se reintentaban si el SMTP fallaba. | ✅ Hasta `ALERT_MAX_ATTEMPTS` intentos con espera creciente; después quedan como `failed`, con el error. |
| A10 | Sin cabecera CSP. | ✅ CSP estricta (`script-src 'self'`). |

## Frontend

| # | Hallazgo | Estado |
|---|---|---|
| F1 | Restos de la plantilla de Google AI Studio (`@google/genai`, `express`, `dotenv`, `tsx`) y la inyección de `GEMINI_API_KEY` en el código publicado. | ✅ Quitados. |
| F2 | `npm audit`: 14 vulnerabilidades, 2 críticas. | ✅ Ver el informe del frontend en el README. |
| F3 | `tsc` daba 6 errores (faltaba `@types/react`) y `npm run lint` estaba roto. | ✅ |
| F4 | `App.tsx` de 1.300 líneas, sin router ni URLs. | ✅ Dividido en páginas con `react-router`. |
| F5 | Mezcla de inglés y español, sin tildes. | ✅ Todo en español. |
| F6 | El contenedor servía el servidor de desarrollo de Vite. | ✅ Build de producción servido por FastAPI. |
| F7 | `window.confirm` para borrar y una foto de Unsplash como imagen por defecto. | ✅ Modal propio y un marcador SVG local. |

## Repositorio

| # | Hallazgo | Estado |
|---|---|---|
| R1 | `front/.npm-cache` commiteada: 505 archivos, 43 MB. | ✅ Fuera del árbol. Sigue en el historial de git (reescribir el historial de un repo público es destructivo; queda documentado). |
| R2 | `.pyc` commiteados; `pricetracker.session.sql` vacío; `backend/package-lock.json`; `metadata.json`; tres `.env.*.example` casi iguales. | ✅ Borrados. |
| R3 | Tests: ninguno cubría lo que fallaba. | ✅ De 41 a más de 130 tests: precios, URLs/SSRF, parseo de las dos tiendas, reglas de alerta, reintentos, la API de punta a punta y la configuración. |
| R4 | Dos copias del proyecto; Docker ejecutaba la vieja (`price-tracker-app`). | 📝 Los datos se migraron a la nueva; la copia vieja queda parada y se puede borrar. |

## Lo que queda abierto

- **Amazon y su captcha.** Desde una IP doméstica funciona casi siempre; si empieza a bloquear, `SCRAPER_PROXY_SERVER` con un proxy residencial. Para un uso público lo correcto sería la API oficial de productos de Amazon (pide cuenta de afiliado), porque scrapear va contra sus condiciones de uso.
- **PCComponentes sin navegador.** Medir si responde a `httpx` con el JSON-LD; sería diez veces más rápido (D5).
- **Usuarios de prueba.** La base de datos migrada tiene 12 cuentas `@example.com` de las pruebas de marzo. No molestan; se pueden borrar.
- **La cuenta del «usuario por defecto».** Cuatro productos pertenecen a la cuenta que se creó sin contraseña cuando la app no exigía login. Para entrar: «¿Has olvidado tu contraseña?» con ese email.
