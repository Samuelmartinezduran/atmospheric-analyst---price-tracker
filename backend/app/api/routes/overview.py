"""Resumen del panel y lecturas recientes del usuario (columna izquierda del diseño «Consola»)."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.db.models import Alert, PriceHistory, Product
from app.schemas.overview import AlertCounts, ReadingResponse, SummaryCounts, SummaryResponse

router = APIRouter()


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@router.get("/summary", response_model=SummaryResponse)
def summary(user: CurrentUser, db: DbSession) -> SummaryResponse:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    products = list(db.scalars(select(Product).where(Product.user_id == user.id, Product.is_active.is_(True))).all())

    counts = SummaryCounts(total=len(products))
    for product in products:
        if product.last_status == "ok" and product.last_price is not None:
            if product.last_price <= product.desired_price:
                counts.below_target += 1
            else:
                counts.above_target += 1
        elif product.last_status == "unavailable":
            counts.unavailable += 1
        elif product.last_status == "error":
            counts.error += 1
        else:
            counts.never_checked += 1

    since = now - timedelta(hours=24)
    rows = db.execute(
        select(PriceHistory.status, func.count())
        .where(PriceHistory.user_id == user.id, PriceHistory.checked_at >= since)
        .group_by(PriceHistory.status)
    ).all()
    by_status = dict(rows)

    checked = [_aware(p.last_checked_at) for p in products if p.last_checked_at is not None]
    interval = timedelta(minutes=settings.check_interval_minutes)
    if not products:
        next_check = None
    elif len(checked) < len(products):
        next_check = now  # hay productos sin comprobar: el worker los coge en su próxima vuelta (≤ 1 min)
    else:
        next_check = max(now, min(checked) + interval)

    alerts = dict(
        db.execute(select(Alert.status, func.count()).where(Alert.user_id == user.id).group_by(Alert.status)).all()
    )
    per_product_per_day = max(1, round(24 * 60 / settings.check_interval_minutes))

    return SummaryResponse(
        products=counts,
        alerts=AlertCounts(
            pending=alerts.get("pending", 0), sent=alerts.get("sent", 0), failed=alerts.get("failed", 0)
        ),
        expected_checks_24h=counts.total * per_product_per_day,
        checks_24h=sum(by_status.values()),
        failed_checks_24h=by_status.get("error", 0),
        last_check_at=max(checked) if checked else None,
        next_check_at=next_check,
        check_interval_minutes=settings.check_interval_minutes,
        email_enabled=settings.email_enabled,
    )


@router.get("/readings", response_model=list[ReadingResponse])
def readings(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(20, ge=1, le=200),
    product_id: int | None = None,
) -> list[ReadingResponse]:
    """Lecturas más recientes primero, con el precio correcto anterior de ese producto para ver el cambio."""
    query = (
        select(PriceHistory, Product)
        .join(Product, Product.id == PriceHistory.product_id)
        .where(PriceHistory.user_id == user.id)
    )
    if product_id is not None:
        if not db.scalar(select(Product.id).where(Product.id == product_id, Product.user_id == user.id)):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado.")
        query = query.where(PriceHistory.product_id == product_id)
    rows = db.execute(query.order_by(PriceHistory.checked_at.desc(), PriceHistory.id.desc()).limit(limit)).all()

    result = []
    for point, product in rows:
        previous = db.scalar(
            select(PriceHistory.price)
            .where(
                PriceHistory.product_id == point.product_id,
                PriceHistory.price.isnot(None),
                (PriceHistory.checked_at < point.checked_at)
                | ((PriceHistory.checked_at == point.checked_at) & (PriceHistory.id < point.id)),
            )
            .order_by(PriceHistory.checked_at.desc(), PriceHistory.id.desc())
            .limit(1)
        )
        result.append(
            ReadingResponse(
                id=point.id,
                product_id=product.id,
                product_title=product.title,
                store=product.store,
                price=point.price,
                previous_price=previous,
                desired_price=product.desired_price,
                status=point.status,
                error_message=point.error_message,
                checked_at=point.checked_at,
            )
        )
    return result
