import json
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.init_db import init_db

settings = get_settings()


def build_csp(script_hashes: list[str] | None = None) -> str:
    """CSP estricta. Los únicos scripts en línea permitidos son los que Astro genera al compilar
    (el arranque de las islas), identificados por su hash en `csp-hashes.json`."""
    scripts = " ".join(["'self'", *(f"'{h}'" for h in script_hashes or [])])
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src {scripts}",
            # Astro y las islas aplican algunos estilos en línea.
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self'",
            # Las fotos de producto vienen de los CDN de las tiendas.
            "img-src 'self' data: https:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
    )


CONTENT_SECURITY_POLICY = build_csp()


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    settings.assert_safe_for_runtime()
    init_db()
    yield


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, csp: str = CONTENT_SECURITY_POLICY):
        super().__init__(app)
        self.csp = csp

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if not request.url.path.startswith("/api/docs"):
            headers.setdefault("Content-Security-Policy", self.csp)
        if settings.security_hsts_enabled:
            headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


def create_app(run_lifespan: bool = True) -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="2.0.0",
        lifespan=lifespan if run_lifespan else None,
        docs_url="/api/docs" if settings.is_dev else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.is_dev else None,
    )
    dist = Path(settings.frontend_dist_dir) if settings.frontend_dist_dir.strip() else None
    app.add_middleware(SecurityHeadersMiddleware, csp=build_csp(_load_script_hashes(dist)))
    # El JS y el CSS del frontend pasan de ~440 KB a ~130 KB por la red.
    app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)
    app.include_router(api_router)
    if dist is not None:
        _mount_frontend(app, dist)
    return app


def _load_script_hashes(dist: Path | None) -> list[str]:
    if dist is None:
        return []
    path = dist / "csp-hashes.json"
    try:
        hashes = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [h for h in hashes if isinstance(h, str) and re.fullmatch(r"sha(256|384|512)-[A-Za-z0-9+/=]+", h)]


LEGACY_PRODUCT_PATH = re.compile(r"^productos/(\d+)/?$")


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Sirve el frontend de Astro (salida estática, una carpeta por página) en el mismo origen que la API (D3, D12).

    `/entrar` → `entrar/index.html`; `/_astro/*` lleva hash y se cachea un año; lo que no existe
    devuelve `404.html` con estado 404.
    """
    if not (dist / "index.html").is_file():
        return
    dist = dist.resolve()
    not_found = dist / "404.html"

    def page(path: Path, status_code: int = 200) -> FileResponse:
        return FileResponse(path, status_code=status_code, headers={"Cache-Control": "no-cache"})

    @app.get("/{full_path:path}", include_in_schema=False)
    def frontend(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="No existe.")
        legacy = LEGACY_PRODUCT_PATH.match(full_path)
        if legacy:
            # Enlaces de la versión anterior (SPA con /productos/:id).
            return RedirectResponse(f"/producto?id={legacy.group(1)}", status_code=301)

        clean = full_path.strip("/")
        for candidate in (dist / clean, dist / clean / "index.html", dist / f"{clean}.html"):
            resolved = candidate.resolve()
            if resolved.is_file() and resolved.is_relative_to(dist):
                if resolved.suffix == ".html":
                    return page(resolved)
                immutable = clean.startswith(("_astro/", "assets/"))
                cache = "public, max-age=31536000, immutable" if immutable else "public, max-age=3600"
                return FileResponse(resolved, headers={"Cache-Control": cache})
        if not_found.is_file():
            return page(not_found, status_code=404)
        # Sin 404.html es una SPA con su propio router (el frontend anterior): todo va a index.html.
        return page(dist / "index.html")


app = create_app()
