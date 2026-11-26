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

---

## Segunda ronda: revisión independiente del backend nuevo

Después de reescribir el backend, un revisor que no había participado en el código lo revisó buscando fallos, y reprodujo cada hallazgo con scripts contra SQLite y contra un Postgres temporal. Encontró problemas reales en la reescritura; todos están corregidos en el segundo commit y tienen su test.

| Gravedad | Hallazgo | Arreglo |
|---|---|---|
| Alta | La plantilla `.env.example` dejaba `AUTH_JWT_SECRET` vacío y los tokens de depuración activados. Un JWT firmado con la clave `""` se aceptaba, y los `sid` son correlativos, así que se podían fabricar sesiones. | El secreto es obligatorio siempre (≥ 32 caracteres) y también se comprueba al firmar y verificar. Los tokens de depuración exigen `dev` **y** el correo desactivado, y la plantilla los trae apagados. |
| Media | Quien registraba primero un email ajeno dejaba puesta su contraseña; al verificar, la víctima activaba la del atacante. | Un registro sobre una cuenta sin verificar sustituye la contraseña y anula los enlaces anteriores. |
| Media | El worker abría las URLs guardadas sin revalidarlas, y la 0004 conservaba las que el código antiguo había aceptado. | Se revalida antes de cada lectura (si no pasa, el producto se desactiva) y la migración 0005 desactiva las existentes. |
| Media | `/register` revelaba por tiempo si una cuenta existía (63 ms frente a 5 ms) y no tenía límite de intentos. | El hash se calcula siempre, hay límite por conexión y los correos de cuenta se envían en segundo plano. |
| Media | Las comprobaciones manuales abrían un Chromium por petición sin límite: unas 15 peticiones agotaban las conexiones a la base de datos. | Máximo 2 a la vez (429 con `Retry-After`); el alta de un producto deja la primera lectura al worker si está ocupado. |
| Baja | El parser de Rust aceptaba espacios en cualquier posición: «649 99 €» daba 64.999 €. | Los espacios solo valen como separador de miles. Hay un test de propiedad nuevo. |
| Baja | Un precio JSON-LD con forma de objeto lanzaba `TypeError` y hacía fallar la página. | Se rechaza como precio no válido y se prueba la siguiente fuente. |
| Baja | Un PATCH del objetivo o un DELETE durante una comprobación generaban una alerta incoherente o abortaban la ronda entera. | PATCH y DELETE toman el bloqueo (409 si está ocupado), y un fallo inesperado en un producto ya no corta la ronda. |
| Baja | Migración 0004: URLs sin esquema, `/exec/obidos/asin/` y URLs de casi 2048 caracteres. | Corregido, con tests de las funciones de la migración. |
| Baja | La comprobación del host final se hacía después de que Chromium siguiera las redirecciones. | Las navegaciones a hosts ajenos se cortan antes de hacer la petición. |
| Baja | Con el correo desactivado, las alertas se acumulaban y se enviaban todas de golpe al activarlo. | Caducan a las 48 horas. |
| Baja | Alembic (`fileConfig`) silenciaba los logs de uvicorn y del worker, y el worker heredaba un healthcheck HTTP que nunca pasaría. | Corregido. |

**Sin corregir:** el límite de intentos de login es por `IP + email`. No frena a quien pruebe una contraseña contra muchas cuentas ni a quien vaya cambiando de IP, y detrás de la NAT de Docker Desktop todas las peticiones comparten IP, así que alguien podría bloquear el acceso de un usuario concreto. Con la app escuchando solo en `127.0.0.1` no es explotable; si se publica, conviene añadir un límite global por cuenta y un proxy con la IP real (`TRUST_PROXY_HEADERS`).

**Comprobado sin fallos:** el servido de la SPA (path traversal), el bloqueo consultivo contra comprobaciones dobles, el CSRF, y el desbordamiento y el redondeo del parser.

## Verificación final (26/11/2026)

- **Backend:** 158 tests de Python y 13 de Rust (incluidos los de propiedades); `ruff check` y `ruff format` limpios.
- **Frontend:** `tsc` con 0 errores, 44 tests, build correcto y `npm audit` a 0.
- **Datos reales:** migración probada sobre una copia de la base de datos de marzo-abril: 7 productos, 204 puntos de historial y 14 usuarios, ninguno perdido.
- **De punta a punta, contra el stack real en Docker:** registro, verificación, login, alta de un producto de PCComponentes con lectura real (≈3 s), detalle, alertas, ajustes, versión móvil sin scroll horizontal y redirección de los enlaces antiguos.
- **Scrapers en vivo:** las dos tiendas responden con una sola sesión de navegador (~10 s para tres productos).
