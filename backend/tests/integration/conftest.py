"""Fixtures de la API: la app con la base de datos de los tests y un lector de precios falso."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.routes.products import get_price_checker
from app.db.session import get_db_session
from app.main import create_app
from app.services.price_check_service import check_products
from tests.conftest import ok


@pytest.fixture()
def fake_prices() -> dict[str, list]:
    """Precios que devolverá el lector falso, por URL canónica."""
    return {}


@pytest.fixture()
def app(session_factory, fake_prices):
    application = create_app(run_lifespan=False)

    def db() -> Iterator:
        with session_factory() as session:
            yield session

    def checker():
        def fetch(product):
            outcomes = fake_prices.get(product.url) or [ok("100")]
            outcome = outcomes.pop(0) if len(outcomes) > 1 else outcomes[0]
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        return lambda session, ids: check_products(session, ids, fetch=fetch)

    application.dependency_overrides[get_db_session] = db
    application.dependency_overrides[get_price_checker] = checker
    return application


@pytest.fixture()
def client(app) -> TestClient:
    return TestClient(app)
