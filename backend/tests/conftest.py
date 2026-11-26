"""Configuración común de los tests.

Las variables de entorno se fijan ANTES de importar la app, porque los ajustes
se leen una vez y se cachean.
"""

import os

os.environ.update(
    {
        "APP_ENV": "dev",
        "AUTH_ENABLE_DEBUG_TOKENS": "true",
        "EMAIL_ENABLED": "false",
        "DATABASE_URL": "sqlite+pysqlite:///:memory:",
        "FRONTEND_DIST_DIR": "",
        "AUTH_JWT_SECRET": "secreto-de-tests-con-mas-de-32-caracteres-0123456789",
    }
)

from collections.abc import Callable, Iterator  # noqa: E402
from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.models import User  # noqa: E402
from app.scrapers.base import ScrapeResult  # noqa: E402


@pytest.fixture()
def session_factory() -> Callable[[], Session]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


@pytest.fixture()
def session(session_factory) -> Iterator[Session]:
    with session_factory() as db:
        yield db


@pytest.fixture()
def make_user(session) -> Callable[..., User]:
    counter = {"n": 0}

    def _make(email: str | None = None) -> User:
        counter["n"] += 1
        user = User(
            email=email or f"usuario{counter['n']}@example.com",
            password_hash=None,
            is_email_verified=True,
            is_active=True,
        )
        session.add(user)
        session.commit()
        return user

    return _make


def ok(price: str, title: str = "Producto de prueba") -> ScrapeResult:
    return ScrapeResult(title=title, image_url=None, price=Decimal(price), currency="EUR", in_stock=True)


def out_of_stock() -> ScrapeResult:
    return ScrapeResult(title="Producto de prueba", image_url=None, price=None, currency="EUR", in_stock=False)
