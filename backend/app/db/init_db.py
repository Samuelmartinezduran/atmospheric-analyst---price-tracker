"""Aplica las migraciones de Alembic al arrancar.

La API y el worker arrancan a la vez: un bloqueo consultivo de Postgres evita
que los dos ejecuten las migraciones al mismo tiempo.
"""

import logging
import time
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from alembic import command
from alembic.config import Config
from app.core.config import get_settings
from app.db.session import engine

logger = logging.getLogger(__name__)
MIGRATION_LOCK = (41_000, 0)


def _alembic_config() -> Config:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
    config.attributes["configure_logger"] = False
    return config


def wait_for_database(attempts: int = 30, delay_seconds: float = 2.0) -> None:
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt == attempts:
                raise
            logger.info("Esperando a la base de datos (%s/%s)...", attempt, attempts)
            time.sleep(delay_seconds)


def init_db() -> None:
    wait_for_database()
    config = _alembic_config()
    if engine.dialect.name != "postgresql":
        command.upgrade(config, "head")
        return
    with engine.connect() as connection:
        connection.execute(text("SELECT pg_advisory_lock(:a, :b)"), {"a": MIGRATION_LOCK[0], "b": MIGRATION_LOCK[1]})
        try:
            command.upgrade(config, "head")
        finally:
            connection.execute(
                text("SELECT pg_advisory_unlock(:a, :b)"), {"a": MIGRATION_LOCK[0], "b": MIGRATION_LOCK[1]}
            )
            connection.commit()
