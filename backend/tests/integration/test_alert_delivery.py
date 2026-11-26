from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.db.models import Alert
from app.services import alert_service
from app.services.email_service import EmailError, format_eur
from app.services.product_service import upsert_product

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)


@pytest.fixture()
def email_on(monkeypatch):
    monkeypatch.setattr(alert_service.get_settings(), "email_enabled", True)
    monkeypatch.setattr(alert_service.get_settings(), "alert_max_attempts", 3)


@pytest.fixture()
def pending_alert(session, make_user) -> Alert:
    user = make_user()
    product = upsert_product(session, "https://www.amazon.es/dp/B0DTHV8THW", Decimal("100"), owner=user).product
    product.title = "Tarjeta gráfica\ncon salto de línea"
    alert = Alert(
        user_id=user.id,
        product_id=product.id,
        email_to=user.email,
        desired_price=Decimal("100"),
        triggered_price=Decimal("2499"),
        currency="EUR",
        status="pending",
        attempts=0,
        triggered_at=NOW,
    )
    session.add(alert)
    session.commit()
    return alert


def test_sends_pending_alert(session, pending_alert, email_on, monkeypatch) -> None:
    sent = []
    monkeypatch.setattr(alert_service, "send_price_alert_email", lambda **kwargs: sent.append(kwargs))
    summary = alert_service.deliver_pending_alerts(session, now=NOW)
    session.refresh(pending_alert)
    assert summary.sent == 1
    assert pending_alert.status == "sent"
    assert pending_alert.sent_at is not None
    assert sent[0]["to_email"] == pending_alert.email_to


def test_failed_delivery_is_retried_with_backoff_then_given_up(session, pending_alert, email_on, monkeypatch) -> None:
    def broken(**_kwargs):
        raise EmailError("SMTP caído")

    monkeypatch.setattr(alert_service, "send_price_alert_email", broken)

    alert_service.deliver_pending_alerts(session, now=NOW)
    session.refresh(pending_alert)
    assert (pending_alert.status, pending_alert.attempts) == ("pending", 1)
    assert pending_alert.next_attempt_at.replace(tzinfo=timezone.utc) == NOW + timedelta(minutes=5)

    # Antes de que toque, no se reintenta.
    assert alert_service.deliver_pending_alerts(session, now=NOW + timedelta(minutes=1)).retried == 0

    alert_service.deliver_pending_alerts(session, now=NOW + timedelta(minutes=6))
    alert_service.deliver_pending_alerts(session, now=NOW + timedelta(hours=1))
    session.refresh(pending_alert)
    assert (pending_alert.status, pending_alert.attempts) == ("failed", 3)
    assert "SMTP caído" in pending_alert.error_message


def test_old_alerts_expire_instead_of_being_sent(session, pending_alert, email_on, monkeypatch) -> None:
    sent = []
    monkeypatch.setattr(alert_service, "send_price_alert_email", lambda **kwargs: sent.append(kwargs))
    summary = alert_service.deliver_pending_alerts(session, now=NOW + timedelta(days=3))
    session.refresh(pending_alert)
    assert (summary.expired, sent, pending_alert.status) == (1, [], "failed")
    assert "Caducada" in pending_alert.error_message


def test_nothing_is_sent_when_email_is_disabled(session, pending_alert, monkeypatch) -> None:
    monkeypatch.setattr(alert_service.get_settings(), "email_enabled", False)
    summary = alert_service.deliver_pending_alerts(session, now=NOW)
    session.refresh(pending_alert)
    assert (summary.sent, pending_alert.status, pending_alert.attempts) == (0, "pending", 0)


def test_retry_delay_grows_and_is_capped() -> None:
    assert [alert_service.retry_delay(n) for n in (1, 2, 3)] == [
        timedelta(minutes=5),
        timedelta(minutes=10),
        timedelta(minutes=20),
    ]
    assert alert_service.retry_delay(20) == timedelta(hours=6)


@pytest.mark.parametrize(
    ("value", "text"),
    [
        (Decimal("1099.95"), "1.099,95 €"),
        (Decimal("2499"), "2.499,00 €"),
        (Decimal("9.9"), "9,90 €"),
        (Decimal("1234567.8"), "1.234.567,80 €"),
    ],
)
def test_format_eur(value, text) -> None:
    assert format_eur(value) == text
