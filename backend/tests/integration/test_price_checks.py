from collections import deque
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.db.models import Alert, PriceHistory, Product
from app.scrapers.base import BlockedError
from app.services.price_check_service import check_products, due_product_ids
from app.services.product_service import update_product, upsert_product
from tests.conftest import ok, out_of_stock


def scripted_fetch(*outcomes):
    """Lector falso: devuelve (o lanza) cada resultado en orden."""
    queue = deque(outcomes)

    def fetch(_product):
        outcome = queue.popleft()
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    return fetch


def run(session, product, *outcomes):
    fetch = scripted_fetch(*outcomes)
    for _ in outcomes:
        check_products(session, [product.id], fetch=fetch)
    session.refresh(product)


def alerts(session, product) -> list[Alert]:
    return list(session.scalars(select(Alert).where(Alert.product_id == product.id)).all())


def new_product(session, user, target="100.00"):
    return upsert_product(session, "https://www.amazon.es/dp/B0DTHV8THW", Decimal(target), owner=user).product


def test_alert_only_when_price_crosses_target(session, make_user) -> None:
    product = new_product(session, make_user())
    run(session, product, ok("120"), ok("95"), ok("90"), ok("85"))
    assert len(alerts(session, product)) == 1
    assert alerts(session, product)[0].triggered_price == Decimal("95.00")


def test_scraping_error_does_not_cause_a_repeated_alert(session, make_user) -> None:
    """Regresión: un bloqueo de Amazon reiniciaba el estado y el siguiente precio bajo mandaba otro email."""
    product = new_product(session, make_user())
    run(session, product, ok("95"), BlockedError("captcha"), ok("94"), RuntimeError("timeout"), ok("93"))
    assert len(alerts(session, product)) == 1
    assert product.last_status == "ok"
    assert product.was_below_desired is True


def test_back_in_stock_below_target_alerts_again(session, make_user) -> None:
    product = new_product(session, make_user())
    run(session, product, ok("95"), out_of_stock(), ok("94"))
    assert len(alerts(session, product)) == 2


def test_rising_above_target_and_falling_again_alerts_again(session, make_user) -> None:
    product = new_product(session, make_user())
    run(session, product, ok("95"), ok("130"), ok("99"))
    assert [a.triggered_price for a in alerts(session, product)] == [Decimal("95.00"), Decimal("99.00")]


def test_changing_target_above_current_price_does_not_email(session, make_user) -> None:
    user = make_user()
    product = new_product(session, user, target="50")
    run(session, product, ok("80"))
    update_product(session, product.id, user, desired_price=Decimal("90"))
    run(session, product, ok("79"))
    assert alerts(session, product) == []
    # Pero si luego sube por encima del objetivo y vuelve a bajar, sí avisa.
    run(session, product, ok("95"), ok("85"))
    assert len(alerts(session, product)) == 1


def test_every_check_is_recorded_in_history(session, make_user) -> None:
    product = new_product(session, make_user())
    run(session, product, ok("120"), BlockedError("captcha"), out_of_stock())
    statuses = [p.status for p in session.scalars(select(PriceHistory).order_by(PriceHistory.id)).all()]
    assert statuses == ["ok", "error", "unavailable"]
    assert product.last_price == Decimal("120.00")  # el último precio bueno se conserva


def test_alert_goes_to_the_owner(session, make_user) -> None:
    owner = make_user("duena@example.com")
    product = new_product(session, owner)
    run(session, product, ok("10"))
    assert alerts(session, product)[0].email_to == "duena@example.com"


def test_one_product_failing_does_not_lose_the_others(session, make_user) -> None:
    user = make_user()
    a = upsert_product(session, "https://www.amazon.es/dp/B000000001", Decimal("50"), owner=user).product
    b = upsert_product(session, "https://www.amazon.es/dp/B000000002", Decimal("50"), owner=user).product
    summary = check_products(session, [a.id, b.id], fetch=scripted_fetch(RuntimeError("caído"), ok("40")))
    assert (summary.checked_ok, summary.checked_failed, summary.alerts_created) == (1, 1, 1)


def test_due_products_respect_the_interval(session, make_user) -> None:
    user = make_user()
    now = datetime.now(timezone.utc)
    fresh = upsert_product(session, "https://www.amazon.es/dp/B000000001", Decimal("5"), owner=user).product
    stale = upsert_product(session, "https://www.amazon.es/dp/B000000002", Decimal("5"), owner=user).product
    never = upsert_product(session, "https://www.amazon.es/dp/B000000003", Decimal("5"), owner=user).product
    fresh.last_checked_at = now - timedelta(minutes=5)
    stale.last_checked_at = now - timedelta(days=2)
    session.commit()
    assert due_product_ids(session, now=now) == [never.id, stale.id]


def test_inactive_products_are_not_checked(session, make_user) -> None:
    product = new_product(session, make_user())
    product.is_active = False
    session.commit()
    summary = check_products(session, [product.id], fetch=scripted_fetch(ok("1")))
    assert summary.total_products == 0
    assert session.scalar(select(Product.last_status).where(Product.id == product.id)) == "never_checked"
