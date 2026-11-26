from fastapi import APIRouter, Depends

from app.api.deps import require_csrf_protection
from app.api.routes.alerts import router as alerts_router
from app.api.routes.auth import router as auth_router
from app.api.routes.products import router as products_router

api_router = APIRouter(prefix="/api", dependencies=[Depends(require_csrf_protection)])
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(products_router, tags=["products"])
api_router.include_router(alerts_router, tags=["alerts"])


@api_router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
