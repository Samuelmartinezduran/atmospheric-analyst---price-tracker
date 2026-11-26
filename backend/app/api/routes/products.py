import threading
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.db.models import Product
from app.schemas.history import PriceHistoryResponse
from app.schemas.job import PriceCheckSummaryResponse
from app.schemas.product import (
    PriceStatsResponse,
    ProductCreateRequest,
    ProductResponse,
    ProductUpdateRequest,
    StoreResponse,
)
from app.scrapers.urls import STORES, UnsupportedUrlError
from app.services.price_check_service import PriceCheckSummary, check_products, user_product_ids
from app.services.product_service import (
    ProductBusyError,
    ProductNotFoundError,
    delete_product,
    get_owned_product,
    get_product_history,
    list_products,
    previous_prices,
    price_stats,
    update_product,
    upsert_product,
)

router = APIRouter()

PriceChecker = Callable[[Session, list[int]], PriceCheckSummary]


# Cada comprobación manual abre un Chromium dentro del proceso web y mantiene una conexión
# a la base de datos mientras dura. Se limitan para que nadie pueda tumbar la API a base
# de pulsar «Comprobar» (el worker no pasa por aquí).
MAX_CONCURRENT_MANUAL_CHECKS = 2
_manual_checks = threading.BoundedSemaphore(MAX_CONCURRENT_MANUAL_CHECKS)


class ChecksBusyError(RuntimeError):
    pass


def get_price_checker() -> PriceChecker:
    """Se sustituye en los tests para no abrir un navegador de verdad."""

    def checker(session: Session, ids: list[int]) -> PriceCheckSummary:
        if not _manual_checks.acquire(blocking=False):
            raise ChecksBusyError()
        try:
            return check_products(session, ids)
        finally:
            _manual_checks.release()

    return checker


Checker = Annotated[PriceChecker, Depends(get_price_checker)]

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado.")
BUSY = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="Este producto se está comprobando ahora mismo. Prueba en unos segundos.",
)
TOO_MANY_CHECKS = HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail="Ya hay otras comprobaciones en marcha. Prueba en un momento.",
    headers={"Retry-After": "30"},
)


def _views(session: Session, products: list[Product]) -> list[ProductResponse]:
    ids = [product.id for product in products]
    previous = previous_prices(session, ids)
    stats = price_stats(session, ids)
    views = []
    for product in products:
        view = ProductResponse.model_validate(product)
        view.previous_price = previous.get(product.id)
        view.is_below_target = (
            product.last_status == "ok"
            and product.last_price is not None
            and product.last_price <= product.desired_price
        )
        view.stats = PriceStatsResponse(**vars(stats[product.id]))
        views.append(view)
    return views


def _summary(summary: PriceCheckSummary) -> PriceCheckSummaryResponse:
    return PriceCheckSummaryResponse(**vars(summary))


@router.get("/stores", response_model=list[StoreResponse])
def get_stores() -> list[StoreResponse]:
    return [StoreResponse(code=s.code, name=s.name, domains=list(s.domains), example_url=s.example_url) for s in STORES]


@router.get("/products", response_model=list[ProductResponse])
def get_products(user: CurrentUser, db: DbSession) -> list[ProductResponse]:
    return _views(db, list_products(db, user))


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreateRequest, user: CurrentUser, db: DbSession, checker: Checker, response: Response
) -> ProductResponse:
    try:
        result = upsert_product(db, payload.url, payload.desired_price, owner=user)
    except UnsupportedUrlError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if result.created:
        # Primera lectura en el momento, para que el usuario vea título, foto y precio al instante.
        # Si ya hay demasiadas comprobaciones en marcha, la hará el worker en su próxima ronda.
        try:
            checker(db, [result.product.id])
        except ChecksBusyError:
            pass
        db.refresh(result.product)
    else:
        response.status_code = status.HTTP_200_OK
    return _views(db, [result.product])[0]


@router.patch("/products/{product_id}", response_model=ProductResponse)
def patch_product(product_id: int, payload: ProductUpdateRequest, user: CurrentUser, db: DbSession) -> ProductResponse:
    try:
        product = update_product(db, product_id, user, desired_price=payload.desired_price)
    except ProductNotFoundError as exc:
        raise NOT_FOUND from exc
    except ProductBusyError as exc:
        raise BUSY from exc
    return _views(db, [product])[0]


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_product(product_id: int, user: CurrentUser, db: DbSession) -> None:
    try:
        delete_product(db, product_id, user)
    except ProductNotFoundError as exc:
        raise NOT_FOUND from exc
    except ProductBusyError as exc:
        raise BUSY from exc


@router.get("/products/{product_id}/history", response_model=list[PriceHistoryResponse])
def get_history(product_id: int, user: CurrentUser, db: DbSession) -> list[PriceHistoryResponse]:
    try:
        history = get_product_history(db, product_id, user)
    except ProductNotFoundError as exc:
        raise NOT_FOUND from exc
    return [PriceHistoryResponse.model_validate(point) for point in history]


@router.post("/products/{product_id}/check", response_model=PriceCheckSummaryResponse)
def check_product_now(product_id: int, user: CurrentUser, db: DbSession, checker: Checker) -> PriceCheckSummaryResponse:
    try:
        get_owned_product(db, product_id, user)
    except ProductNotFoundError as exc:
        raise NOT_FOUND from exc
    db.rollback()  # suelta la transacción de lectura antes de tomar el bloqueo
    try:
        summary = checker(db, [product_id])
    except ChecksBusyError as exc:
        raise TOO_MANY_CHECKS from exc
    if summary.skipped:
        raise BUSY
    return _summary(summary)


@router.post("/jobs/check-now", response_model=PriceCheckSummaryResponse)
def check_all_now(user: CurrentUser, db: DbSession, checker: Checker) -> PriceCheckSummaryResponse:
    ids = user_product_ids(db, user.id)
    db.rollback()
    try:
        return _summary(checker(db, ids))
    except ChecksBusyError as exc:
        raise TOO_MANY_CHECKS from exc
