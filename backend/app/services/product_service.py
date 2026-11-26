from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import PriceHistory, Product, User
from app.scrapers.urls import normalize_product_url
from app.services.alert_rules import next_below_state
from app.services.price_check_service import try_lock_product


class ProductNotFoundError(LookupError):
    pass


class ProductBusyError(RuntimeError):
    """Se está comprobando ahora mismo; cambiarlo a la vez daría alertas incoherentes."""


@dataclass
class UpsertResult:
    product: Product
    created: bool


@dataclass
class PriceStats:
    lowest_price: Decimal | None = None
    lowest_price_at: datetime | None = None
    highest_price: Decimal | None = None
    avg_price_30d: Decimal | None = None
    checks_count: int = 0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def upsert_product(session: Session, url: str, desired_price: Decimal, owner: User) -> UpsertResult:
    """Da de alta un producto o, si el usuario ya lo sigue, actualiza su objetivo.

    Lanza ``UnsupportedUrlError`` (un ``ValueError``) si la URL no es de una tienda soportada.
    """
    store, canonical_url = normalize_product_url(url)

    existing = session.scalar(select(Product).where(Product.user_id == owner.id, Product.url == canonical_url))
    if existing:
        existing.is_active = True
        set_desired_price(existing, desired_price)
        session.commit()
        session.refresh(existing)
        return UpsertResult(product=existing, created=False)

    product = Product(
        user_id=owner.id,
        url=canonical_url,
        store=store.code,
        desired_price=desired_price,
        currency="EUR",
        last_status="never_checked",
        was_below_desired=False,
        is_active=True,
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return UpsertResult(product=product, created=True)


def set_desired_price(product: Product, desired_price: Decimal) -> None:
    """Cambia el objetivo y recalcula si el último precio conocido ya está por debajo.

    Si ya lo está, no se manda email (el usuario lo está viendo en el panel); se
    avisará la próxima vez que el precio cruce el objetivo hacia abajo.
    """
    product.desired_price = desired_price
    product.was_below_desired = next_below_state(
        current_price=product.last_price if product.last_status == "ok" else None,
        desired_price=desired_price,
        in_stock=product.last_status == "ok",
    )


def get_owned_product(session: Session, product_id: int, owner: User) -> Product:
    product = session.scalar(select(Product).where(Product.id == product_id, Product.user_id == owner.id))
    if not product:
        raise ProductNotFoundError(product_id)
    return product


def _lock_owned_product(session: Session, product_id: int, owner: User) -> Product:
    product = get_owned_product(session, product_id, owner)
    if not try_lock_product(session, product_id):
        session.rollback()
        raise ProductBusyError(product_id)
    return product


def update_product(session: Session, product_id: int, owner: User, desired_price: Decimal | None) -> Product:
    product = _lock_owned_product(session, product_id, owner)
    if desired_price is not None:
        set_desired_price(product, desired_price)
    session.commit()
    session.refresh(product)
    return product


def list_products(session: Session, owner: User) -> list[Product]:
    query = (
        select(Product)
        .where(Product.user_id == owner.id, Product.is_active.is_(True))
        .order_by(Product.created_at.desc(), Product.id.desc())
    )
    return list(session.scalars(query).all())


def get_product_history(session: Session, product_id: int, owner: User) -> list[PriceHistory]:
    get_owned_product(session, product_id, owner)
    query = (
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.checked_at.asc(), PriceHistory.id.asc())
    )
    return list(session.scalars(query).all())


def delete_product(session: Session, product_id: int, owner: User) -> None:
    product = _lock_owned_product(session, product_id, owner)
    session.delete(product)
    session.commit()


def previous_prices(session: Session, product_ids: list[int]) -> dict[int, Decimal]:
    """El precio de la comprobación correcta anterior a la última, por producto."""
    if not product_ids:
        return {}
    rn = (
        func.row_number()
        .over(
            partition_by=PriceHistory.product_id,
            order_by=[PriceHistory.checked_at.desc(), PriceHistory.id.desc()],
        )
        .label("rn")
    )
    ranked = (
        select(PriceHistory.product_id, PriceHistory.price, rn)
        .where(PriceHistory.product_id.in_(product_ids), PriceHistory.price.isnot(None))
        .subquery()
    )
    rows = session.execute(select(ranked.c.product_id, ranked.c.price).where(ranked.c.rn == 2)).all()
    return {row.product_id: row.price for row in rows}


def price_stats(session: Session, product_ids: list[int], now: datetime | None = None) -> dict[int, PriceStats]:
    if not product_ids:
        return {}
    now = now or _now()
    stats: dict[int, PriceStats] = {product_id: PriceStats() for product_id in product_ids}

    has_price = (PriceHistory.product_id.in_(product_ids), PriceHistory.price.isnot(None))
    aggregates = session.execute(
        select(
            PriceHistory.product_id,
            func.min(PriceHistory.price),
            func.max(PriceHistory.price),
            func.count(PriceHistory.price),
        )
        .where(*has_price)
        .group_by(PriceHistory.product_id)
    ).all()
    for product_id, lowest, highest, count in aggregates:
        stats[product_id].lowest_price = lowest
        stats[product_id].highest_price = highest
        stats[product_id].checks_count = count

    averages = session.execute(
        select(PriceHistory.product_id, func.avg(PriceHistory.price))
        .where(*has_price, PriceHistory.checked_at >= now - timedelta(days=30))
        .group_by(PriceHistory.product_id)
    ).all()
    for product_id, average in averages:
        if average is not None:
            stats[product_id].avg_price_30d = Decimal(str(average)).quantize(Decimal("0.01"))

    # Última vez que se vio el mínimo histórico.
    minimums = (
        select(PriceHistory.product_id.label("product_id"), func.min(PriceHistory.price).label("lowest"))
        .where(*has_price)
        .group_by(PriceHistory.product_id)
        .subquery()
    )
    lowest_dates = session.execute(
        select(PriceHistory.product_id, func.max(PriceHistory.checked_at))
        .join(
            minimums,
            (minimums.c.product_id == PriceHistory.product_id) & (minimums.c.lowest == PriceHistory.price),
        )
        .group_by(PriceHistory.product_id)
    ).all()
    for product_id, seen_at in lowest_dates:
        stats[product_id].lowest_price_at = seen_at
    return stats
