"""Comprobación de precios.

Reglas (ver D9 en docs/DECISIONES.md):
- Se crea una alerta cuando el precio cruza el objetivo hacia abajo.
- Un error de lectura NO cambia el estado «por debajo del objetivo»: antes lo
  ponía a false y cada bloqueo de Amazon acababa en un email repetido.
- «Sin stock» sí lo reinicia: volver a tener stock por debajo del objetivo es noticia.

Cada producto se procesa en su propia transacción y con un bloqueo consultivo
de Postgres, para que el worker y una comprobación manual no lo procesen a la
vez (eso duplicaba alertas).
"""

import logging
from collections.abc import Callable, Iterable
from contextlib import AbstractContextManager, nullcontext
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Alert, PriceHistory, Product
from app.scrapers import BrowserSession, ScrapeResult, scraper_for_store
from app.scrapers.urls import UnsupportedUrlError, normalize_product_url
from app.services.alert_rules import next_below_state, should_create_alert

logger = logging.getLogger(__name__)

# Primer entero del bloqueo consultivo de dos claves: «espacio» de este proyecto.
ADVISORY_LOCK_NAMESPACE = 41_001


@dataclass
class PriceCheckSummary:
    total_products: int = 0
    checked_ok: int = 0
    checked_failed: int = 0
    alerts_created: int = 0
    skipped: int = 0

    def merge(self, other: "PriceCheckSummary") -> None:
        self.total_products += other.total_products
        self.checked_ok += other.checked_ok
        self.checked_failed += other.checked_failed
        self.alerts_created += other.alerts_created
        self.skipped += other.skipped


Fetcher = Callable[[Product], ScrapeResult]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def apply_check_result(
    session: Session,
    product: Product,
    result: ScrapeResult | None,
    error: Exception | None,
    checked_at: datetime,
) -> Alert | None:
    """Aplica el resultado de una lectura a un producto. Función pura salvo por ``session.add``."""
    product.last_checked_at = checked_at

    if error is not None or result is None:
        message = str(error) if error else "Error desconocido al leer la página."
        product.last_status = "error"
        product.last_error = message[:2000]
        # was_below_desired se queda como estaba (ver docstring del módulo).
        session.add(
            PriceHistory(
                user_id=product.user_id,
                product_id=product.id,
                title_snapshot=product.title,
                price=None,
                currency=product.currency,
                status="error",
                error_message=product.last_error,
                checked_at=checked_at,
            )
        )
        return None

    product.title = result.title or product.title
    product.image_url = result.image_url or product.image_url
    product.currency = result.currency

    if not result.in_stock or result.price is None:
        product.last_status = "unavailable"
        product.last_error = "Sin stock o sin precio visible."
        product.was_below_desired = False
        session.add(
            PriceHistory(
                user_id=product.user_id,
                product_id=product.id,
                title_snapshot=product.title,
                price=None,
                currency=product.currency,
                status="unavailable",
                error_message=product.last_error,
                checked_at=checked_at,
            )
        )
        return None

    product.last_price = result.price
    product.last_status = "ok"
    product.last_error = None
    session.add(
        PriceHistory(
            user_id=product.user_id,
            product_id=product.id,
            title_snapshot=product.title,
            price=result.price,
            currency=result.currency,
            status="ok",
            error_message=None,
            checked_at=checked_at,
        )
    )

    alert = None
    if should_create_alert(
        was_below_desired=product.was_below_desired,
        current_price=result.price,
        desired_price=product.desired_price,
        in_stock=True,
    ):
        alert = Alert(
            user_id=product.user_id,
            product_id=product.id,
            email_to=product.user.email,
            desired_price=product.desired_price,
            triggered_price=result.price,
            currency=result.currency,
            status="pending",
            attempts=0,
        )
        session.add(alert)

    product.was_below_desired = next_below_state(
        current_price=result.price, desired_price=product.desired_price, in_stock=True
    )
    return alert


def try_lock_product(session: Session, product_id: int) -> bool:
    """Bloqueo del producto hasta el final de la transacción actual (no espera)."""
    if session.get_bind().dialect.name != "postgresql":
        return True
    return bool(
        session.execute(
            text("SELECT pg_try_advisory_xact_lock(:ns, :id)"),
            {"ns": ADVISORY_LOCK_NAMESPACE, "id": product_id},
        ).scalar()
    )


def _validated_url(product: Product) -> str:
    """Vuelve a validar la URL guardada antes de abrirla con el navegador.

    Las filas creadas con el código antiguo podían tener URLs que hoy se rechazan
    (p. ej. ``http://169.254.169.254/?x=amazon.es``).
    """
    store, canonical = normalize_product_url(product.url)
    if store.code != product.store:
        raise UnsupportedUrlError("La URL guardada no corresponde a la tienda del producto.")
    return canonical


def check_product(session: Session, product_id: int, fetch: Fetcher) -> PriceCheckSummary:
    """Comprueba un producto en su propia transacción. Nunca lanza por errores de lectura."""
    summary = PriceCheckSummary(total_products=1)
    try:
        if not try_lock_product(session, product_id):
            summary.skipped = 1
            session.rollback()
            return summary

        product = session.get(Product, product_id)
        if not product or not product.is_active:
            summary.total_products = 0
            session.rollback()
            return summary

        try:
            _validated_url(product)
        except UnsupportedUrlError as exc:
            logger.warning("Producto %s desactivado: URL no válida (%s)", product_id, exc)
            product.is_active = False
            product.last_status = "error"
            product.last_error = f"URL no válida; el producto se ha desactivado. {exc}"[:2000]
            session.commit()
            summary.checked_failed = 1
            return summary

        result, error = None, None
        try:
            if scraper_for_store(product.store) is None:
                raise ValueError(f"Tienda no soportada: {product.store}")
            result = fetch(product)
        except Exception as exc:  # noqa: BLE001 - cualquier fallo de lectura se registra en el producto
            logger.warning("Fallo al comprobar el producto %s: %s", product_id, exc)
            error = exc

        alert = apply_check_result(session, product, result, error, _now())
        # Se calcula antes del commit: después, leer el producto recargaría la fila.
        succeeded = error is None and product.last_status == "ok"
        session.commit()
    except Exception:
        session.rollback()
        raise

    if succeeded:
        summary.checked_ok = 1
    else:
        summary.checked_failed = 1
    if alert is not None:
        summary.alerts_created = 1
    return summary


def check_products(
    session: Session,
    product_ids: Iterable[int],
    browser_factory: Callable[[], AbstractContextManager[BrowserSession]] | None = None,
    fetch: Fetcher | None = None,
) -> PriceCheckSummary:
    """Comprueba varios productos con un único navegador.

    ``fetch`` permite inyectar un lector falso en los tests; si no se pasa, se
    abre un ``BrowserSession`` real. Un fallo inesperado en un producto (por
    ejemplo, que lo borren mientras se comprueba) no corta la ronda.
    """
    ids = list(product_ids)
    summary = PriceCheckSummary()
    if not ids:
        return summary

    if fetch is not None:
        context: AbstractContextManager = nullcontext(None)
    else:
        context = (browser_factory or BrowserSession)()

    with context as browser:
        if fetch is None:

            def fetch(product: Product) -> ScrapeResult:  # noqa: F811
                return scraper_for_store(product.store).fetch(_validated_url(product), browser)

        for product_id in ids:
            try:
                summary.merge(check_product(session, product_id, fetch))
            except Exception:  # noqa: BLE001
                logger.exception("Error inesperado con el producto %s; sigo con los demás.", product_id)
                session.rollback()
                summary.merge(PriceCheckSummary(total_products=1, checked_failed=1))
    return summary


def due_product_ids(session: Session, now: datetime | None = None, limit: int = 50) -> list[int]:
    settings = get_settings()
    now = now or _now()
    threshold = now - timedelta(minutes=settings.check_interval_minutes)
    query = (
        select(Product.id)
        .where(
            Product.is_active.is_(True),
            or_(Product.last_checked_at.is_(None), Product.last_checked_at < threshold),
        )
        .order_by(Product.last_checked_at.asc().nulls_first(), Product.id.asc())
        .limit(limit)
    )
    return list(session.scalars(query).all())


def user_product_ids(session: Session, user_id: int) -> list[int]:
    query = select(Product.id).where(Product.user_id == user_id, Product.is_active.is_(True)).order_by(Product.id)
    return list(session.scalars(query).all())
