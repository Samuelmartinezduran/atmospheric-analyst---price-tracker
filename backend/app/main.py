from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.init_db import init_db

settings = get_settings()

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        # Recharts y Tailwind aplican estilos en línea.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        # Las fotos de producto vienen de los CDN de las tiendas.
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    settings.assert_safe_for_runtime()
    init_db()
    yield


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if not request.url.path.startswith("/api/docs"):
            headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
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
    app.add_middleware(SecurityHeadersMiddleware)
    app.include_router(api_router)
    if settings.frontend_dist_dir.strip():
        _mount_frontend(app, Path(settings.frontend_dist_dir))
    return app


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Sirve el frontend compilado en el mismo origen que la API (D3)."""
    index = dist / "index.html"
    if not index.is_file():
        return
    dist = dist.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="No existe.")
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(dist):
            cache = "public, max-age=31536000, immutable" if full_path.startswith("assets/") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        # Cualquier otra ruta es del router del frontend.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


app = create_app()
