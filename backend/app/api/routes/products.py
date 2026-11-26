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


def get_price_checker() -> PriceChecker:
    """Se sustituye en los tests para no abrir un navegador de verdad."""
    return lambda session, ids: check_products(session, ids)


Checker = Annotated[PriceChecker, Depends(get_price_checker)]

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado.")


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
        checker(db, [result.product.id])
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
    return _views(db, [product])[0]


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_product(product_id: int, user: CurrentUser, db: DbSession) -> None:
    try:
        delete_product(db, product_id, user)
    except ProductNotFoundError as exc:
        raise NOT_FOUND from exc


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
    summary = checker(db, [product_id])
    if summary.skipped:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este producto ya se está comprobando. Espera unos segundos.",
        )
    return _summary(summary)


@router.post("/jobs/check-now", response_model=PriceCheckSummaryResponse)
def check_all_now(user: CurrentUser, db: DbSession, checker: Checker) -> PriceCheckSummaryResponse:
    ids = user_product_ids(db, user.id)
    db.rollback()
    return _summary(checker(db, ids))
