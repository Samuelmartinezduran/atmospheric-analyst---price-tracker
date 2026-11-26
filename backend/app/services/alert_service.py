"""Envío de alertas pendientes con reintentos y espera creciente."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Alert, Product
from app.services.email_service import EmailError, send_price_alert_email

logger = logging.getLogger(__name__)

BASE_RETRY_DELAY = timedelta(minutes=5)
# Un aviso de bajada de precio de hace días ya no sirve (el precio puede haber vuelto a subir).
# Pasa, por ejemplo, si el correo estuvo desactivado un tiempo y luego se activa.
MAX_ALERT_AGE = timedelta(hours=48)


@dataclass
class AlertDeliverySummary:
    sent: int = 0
    retried: int = 0
    failed: int = 0
    expired: int = 0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def retry_delay(attempts: int) -> timedelta:
    """5 min, 10, 20, 40... con tope de 6 horas."""
    return min(BASE_RETRY_DELAY * (2 ** max(0, attempts - 1)), timedelta(hours=6))


def deliver_pending_alerts(session: Session, now: datetime | None = None, limit: int = 20) -> AlertDeliverySummary:
    settings = get_settings()
    summary = AlertDeliverySummary()
    if not settings.email_enabled:
        return summary

    now = now or _now()
    query = (
        select(Alert)
        .where(Alert.status == "pending", or_(Alert.next_attempt_at.is_(None), Alert.next_attempt_at <= now))
        .order_by(Alert.triggered_at.asc(), Alert.id.asc())
        .limit(limit)
    )
    if session.get_bind().dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    alerts = list(session.scalars(query).all())

    for alert in alerts:
        triggered_at = (
            alert.triggered_at if alert.triggered_at.tzinfo else alert.triggered_at.replace(tzinfo=timezone.utc)
        )
        if now - triggered_at > MAX_ALERT_AGE:
            alert.status = "failed"
            alert.error_message = "Caducada: no se envió en las 48 horas siguientes a la bajada de precio."
            alert.next_attempt_at = None
            summary.expired += 1
            session.commit()
            continue
        product = session.get(Product, alert.product_id)
        alert.attempts += 1
        alert.last_attempt_at = now
        try:
            send_price_alert_email(
                to_email=alert.email_to,
                product_title=(product.title if product else None) or (product.url if product else "Producto"),
                product_url=product.url if product else "",
                triggered_price=alert.triggered_price,
                desired_price=alert.desired_price,
            )
        except EmailError as exc:
            alert.error_message = str(exc)[:2000]
            if alert.attempts >= settings.alert_max_attempts:
                alert.status = "failed"
                alert.next_attempt_at = None
                summary.failed += 1
                logger.error("Alerta %s descartada tras %s intentos: %s", alert.id, alert.attempts, exc)
            else:
                alert.next_attempt_at = now + retry_delay(alert.attempts)
                summary.retried += 1
                logger.warning("Alerta %s no enviada (intento %s): %s", alert.id, alert.attempts, exc)
        else:
            alert.status = "sent"
            alert.sent_at = now
            alert.error_message = None
            alert.next_attempt_at = None
            summary.sent += 1
        # Se guarda alerta a alerta: si el proceso muere, no se reenvía lo ya enviado.
        session.commit()
    return summary
