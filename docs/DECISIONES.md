# Decisiones de arquitectura

Registro de las decisiones tomadas al rehacer el proyecto (noviembre de 2026). Cada una dice qué se decidió, por qué y qué se descartó. Si una decisión cambia, se añade una nueva entrada que la sustituye; no se borra la antigua.

---

## D1. Se queda FastAPI; no se migra a Django

**Decisión:** mantener FastAPI + SQLAlchemy + Alembic.

**Por qué:**
- El proyecto es una API JSON con un frontend React aparte. Django brilla cuando renderiza plantillas en el servidor, usa su ORM y su panel de administración. Aquí no usaríamos casi nada de eso.
- La capa que estaba bien hecha (autenticación con argon2, tokens hasheados, rotación de sesiones, CSRF) está escrita en FastAPI y funciona; tiene tests. Reescribirla en Django es trabajo sin ganancia para el usuario.
- Pydantic ya valida las entradas y genera la documentación OpenAPI (`/docs`) sin esfuerzo.

**Qué perdemos:** el admin de Django, que vendría bien para ver usuarios y productos. Se cubre con `psql` o con cualquier cliente SQL.

**Descartado:** Django + DRF (reescritura completa), Django Ninja (mismo modelo que FastAPI, pero con el peso de Django).

---

## D2. Fuera n8n: el backend tiene su propio worker

**Decisión:** eliminar n8n. Un proceso `worker` (misma imagen que la API, comando `python -m app.worker`) comprueba los precios cada cierto tiempo y envía las alertas por email.

**Por qué:**
- n8n solo hacía dos cosas: un cron diario y llamar a tres endpoints. Para eso añadía un servicio entero, una base de datos propia, una clave interna compartida, un usuario administrador con contraseña por defecto (`Admin1234!`) y una imagen sin versión fijada que se actualizó sola a la 2.x y dejó de ejecutar los workflows. **Desde el 1 de abril de 2026 no se había comprobado ningún precio.**
- Con un worker propio, la lógica está en Python, versionada, con tests, y sin endpoints `/internal` que proteger.

**Detalles:**
- El worker comprueba los productos cuya última comprobación es más antigua que `CHECK_INTERVAL_MINUTES` (por defecto 360 = cada 6 horas), no "todos a medianoche".
- Usa un único Chromium por ronda en lugar de lanzar uno por producto.
- Cada producto se guarda en su propia transacción: si uno falla, los demás no se pierden.
- Un bloqueo consultivo de Postgres (`pg_try_advisory_xact_lock`) impide que el worker y una comprobación manual procesen el mismo producto a la vez (antes eso podía duplicar alertas).
- Los emails se reintentan con espera creciente; tras `ALERT_MAX_ATTEMPTS` intentos la alerta queda como `failed` con el error guardado.

**Descartado:** APScheduler dentro de uvicorn (con varios workers de uvicorn se ejecutaría varias veces), Celery + Redis (sobredimensionado para esto), cron del sistema (no funciona igual en Windows).

---

## D3. Un solo origen: FastAPI sirve el frontend compilado. Fuera Vercel

**Decisión:** el frontend se compila (`vite build`) dentro de la imagen Docker y FastAPI lo sirve en `/`, con la API en `/api`. En desarrollo, Vite hace de proxy de `/api` hacia el backend.

**Por qué:**
- El despliegue "frontend en Vercel + backend en otro dominio" no podía funcionar: las cookies `SameSite=Lax` no viajan entre sitios distintos y el frontend no puede leer la cookie CSRF de otro dominio, así que el login o todas las mutaciones fallaban.
- Con un solo origen desaparecen CORS, `SameSite=None`, y la mitad de las variables de configuración.
- El contenedor del frontend ejecutaba el servidor de desarrollo de Vite (`npm run dev`) como si fuera producción.

**Descartado:** mantener Vercel con un backend en un subdominio del mismo sitio (exige dominio propio y DNS para algo que corre en casa).

---

## D4. Docker sí, pero más simple

**Decisión:** Docker Compose con tres servicios: `db` (Postgres 16), `web` (API + frontend) y `worker`. `web` y `worker` salen de **la misma imagen**.

**Por qué es necesario:** Playwright necesita Chromium y sus librerías del sistema; la imagen oficial de Playwright lo resuelve igual en Windows, Mac y un servidor. Sin Docker habría que instalar Postgres y los navegadores a mano.

**Qué cambia:**
- De cuatro servicios a tres; de ~50 variables de entorno triplicadas (compose + config.py + 4 ejemplos) a un único `.env.example`. Compose solo lee `.env`.
- Imágenes con versión fijada (`postgres:16.x`, Playwright `v1.52.0`).
- Postgres solo se publica en `127.0.0.1`, no en toda la red local.
- Si `APP_ENV` no es `dev` y hay secretos por defecto, la aplicación **se niega a arrancar**.

**Descartado:** SQLite (perderíamos los bloqueos consultivos y la concurrencia entre `web` y `worker`; además ya hay datos en Postgres).

---

## D5. Se queda Playwright (de momento)

**Decisión:** seguir usando un navegador real para leer las páginas.

**Por qué:** Amazon y PCComponentes (Cloudflare) bloquean con frecuencia a clientes HTTP simples. Un navegador real es más lento pero mucho más fiable. Lo que se arregla es el coste: un solo navegador por ronda y un contexto nuevo por producto.

**Pendiente de medir:** si PCComponentes responde a `httpx` con los datos JSON-LD, ese scraper podría pasar a HTTP simple y ser diez veces más rápido.

---

## D6. Los precios se interpretan según su origen

**Decisión:** el parser de precios distingue entre **formato de máquina** (JSON-LD y metaetiquetas: `1099.95`) y **formato español de texto** (`1.099,95 €`, `2.499€`).

**Por qué:** el parser anterior adivinaba el formato y convertía `2.499€` en **2,50 €**, lo que podía disparar alertas falsas de chollo. Un punto seguido de exactamente tres cifras en texto español es separador de miles, no decimal. Cada scraper sabe de dónde saca cada precio, así que le dice al parser qué formato esperar.

---

## D7. Las URLs se validan y se normalizan antes de abrirlas

**Decisión:** solo se aceptan URLs `http(s)` cuyo **host** (no cualquier parte de la URL) sea exactamente uno de los dominios permitidos. Las de Amazon se normalizan a `https://www.amazon.es/dp/<ASIN>`; las de PCComponentes pierden la query y el fragmento.

**Por qué:** antes bastaba con que el texto `amazon.es` apareciera en la URL, así que `http://169.254.169.254/?x=amazon.es` se aceptaba y el servidor la abría con Chromium (SSRF). Además, la misma página con distinto `?ref=` contaba como productos distintos.

Tras cargar la página también se comprueba que el host final (después de redirecciones) sigue siendo uno permitido.

---

## D8. La autenticación se mantiene, pero sin trampas por defecto

- `AUTH_ENABLE_DEBUG_TOKENS` (devolver tokens de verificación/recuperación en la respuesta) solo puede activarse con `APP_ENV=dev`. Antes estaba activado por defecto y permitía tomar cualquier cuenta sabiendo su email.
- `AUTH_JWT_SECRET` es obligatorio fuera de `dev`.
- `X-Forwarded-For` solo se tiene en cuenta si `TRUST_PROXY_HEADERS=true`; si no, cualquiera podía saltarse el límite de intentos inventándose una IP.
- Se elimina el modo "sin login" (`AUTH_REQUIRE_LOGIN_FOR_APP=false`) y el usuario por defecto que creaba: siempre hace falta cuenta.
- Un usuario sin verificar que pone bien la contraseña recibe un mensaje claro (`403`), no "credenciales inválidas".

---

## D9. Reglas de alertas

- Se avisa cuando el precio **cruza** el objetivo hacia abajo (estaba bien).
- Un **error** de scraping ya no reinicia el estado: antes, cada bloqueo de Amazon seguido de un precio bajo generaba otro email.
- **Sin stock** sí reinicia el estado: si vuelve a haber stock por debajo del objetivo, es noticia y se avisa.
- Al **cambiar el precio objetivo** se recalcula el estado con el último precio conocido: si ya está por debajo, el panel lo muestra, pero no se manda email por algo que el usuario está viendo.

---

## D10. Rust: sí, en una pieza concreta y al final

**Decisión:** el parser de precios (la función que causó el peor fallo) se reescribirá como un crate de Rust con enlace a Python (PyO3 + maturin), compilado dentro de Docker. Se hace **después** de que todo funcione con la versión en Python, usando sus tests como contrato.

**Por qué ahí y no en otro sitio:** es una función pura, sin E/S, fácil de probar a fondo (tests de propiedades con `proptest`), y es justo donde un error cuesta caro. Meter Rust en el scraping o en la API no aportaría nada: el cuello de botella es la red y el navegador, no la CPU.

**Coste asumido:** la imagen Docker gana una etapa de compilación de Rust. No hace falta tener Rust instalado en el PC.

---

## D12. El frontend pasa a Astro (sustituye a D11 en cuanto al framework)

**Decisión:** reescribir el frontend en Astro, con salida estática que sigue sirviendo FastAPI (D3), e islas de React solo donde hay interacción: formulario de alta, gráfica, botones de comprobar, ajustes.

**Por qué:**
- Es el framework del portfolio (samuelmartinez.dev, Astro 7): misma forma de trabajar y la posibilidad de compartir tokens de diseño.
- Encaja con la arquitectura de un solo origen: el resultado son ficheros estáticos. Next.js brilla con su servidor Node (SSR, server actions, rutas de API), que aquí sería un cuarto servicio que mantener; en exportación estática pierde justo eso.
- La app se quejaba de lenta: Astro manda JavaScript solo a las islas, y la gráfica pasa a SVG propio en lugar de Recharts (416 KB).
- Las islas en React permiten aprovechar el cliente de API, el contexto de sesión y sus tests.

**Descartado:** Next.js (ver arriba), SvelteKit (otro lenguaje de plantillas fuera del stack habitual), seguir con la SPA de Vite tal cual (no arregla el peso ni la coherencia con el portfolio).

**Velocidad, arreglado aparte del framework (26/11/2026):** la app se publica también en IPv6 (`[::1]`). En Windows, `localhost` se resuelve primero como `::1` y cada conexión perdía ~200 ms antes de caer a IPv4 (medido: 208 ms frente a 3 ms). Además, FastAPI comprime las respuestas con gzip.

---

## D11. Frontend: React + Vite se quedan; se limpia la plantilla

- Se quitan los restos de la plantilla de Google AI Studio (`@google/genai`, `express`, `dotenv`, `tsx`, la inyección de `GEMINI_API_KEY`, `metadata.json`).
- `App.tsx` (1.300 líneas) se divide en páginas, un cliente de API y un contexto de sesión, con `react-router` para tener URLs reales y botón de atrás.
- Se añaden las pantallas que faltaban: recuperar contraseña y abrir los enlaces de verificación y recuperación de los emails.
- Toda la interfaz en español, con tildes.
- `tsc` sin errores, `npm audit` sin vulnerabilidades altas ni críticas.
