"""worker propio: reintentos de alertas, índice de historial y URLs canónicas

Revision ID: 20261126_0004
Revises: 20260323_0003
Create Date: 2026-11-26

- alerts: attempts, last_attempt_at, next_attempt_at (el worker reintenta envíos).
- price_history: índice (product_id, checked_at) para las estadísticas.
- products: las URLs pasan a su forma canónica (Amazon -> /dp/<ASIN>, PCComponentes
  sin query). Si dos productos del mismo usuario acaban con la misma URL, se
  conserva el más antiguo y el duplicado se desactiva en vez de borrarse.
- products: se recalcula was_below_desired con el último precio (antes los
  errores de scraping lo ponían a false y causaban alertas repetidas).

La normalización se copia aquí a propósito (no se importa de app/) para que la
migración no cambie de comportamiento si el código de la app evoluciona.
"""

import re
from typing import Sequence, Union
from urllib.parse import urlsplit

import sqlalchemy as sa

from alembic import op

revision: str = "20261126_0004"
down_revision: Union[str, Sequence[str], None] = "20260323_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ASIN = re.compile(r"/(?:dp|gp/product|gp/aw/d|exec/obidos/asin)/([A-Z0-9]{10})(?:[/?]|$)", re.IGNORECASE)


_HOSTS = {
    "amazon_es": ("amazon.es", "www.amazon.es", "m.amazon.es", "smile.amazon.es"),
    "pccomponentes": ("pccomponentes.com", "www.pccomponentes.com"),
}


def _canonical(url: str, store: str) -> str | None:
    candidate = url.strip()
    if "://" not in candidate:
        # El código antiguo guardaba la URL tal cual, también sin esquema.
        candidate = "https://" + candidate
    try:
        parts = urlsplit(candidate)
    except ValueError:
        return None
    # Solo se canonicaliza si el host es de verdad de la tienda; lo demás lo desactiva la 0005.
    if (parts.hostname or "").lower().rstrip(".") not in _HOSTS.get(store, ()):
        return None
    if store == "amazon_es":
        match = _ASIN.search(parts.path)
        return f"https://www.amazon.es/dp/{match.group(1).upper()}" if match else None
    if store == "pccomponentes":
        path = re.sub(r"/{2,}", "/", parts.path).rstrip("/")
        return f"https://www.pccomponentes.com{path}" if path else None
    return None


def upgrade() -> None:
    op.add_column("alerts", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("alerts", sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("alerts", sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_price_history_product_checked", "price_history", ["product_id", "checked_at"])

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, user_id, url, store FROM products ORDER BY created_at ASC, id ASC")).all()
    winners: dict[tuple[int, str], int] = {}
    losers: list[int] = []
    renames: list[tuple[int, str]] = []
    for row in rows:
        canonical = _canonical(row.url, row.store) or row.url
        key = (row.user_id, canonical)
        if key in winners:
            losers.append(row.id)
            continue
        winners[key] = row.id
        if canonical != row.url:
            renames.append((row.id, canonical))

    # Primero se apartan los duplicados (URL única marcada) para que el UPDATE de los
    # ganadores no choque con la restricción única (user_id, url).
    for product_id in losers:
        bind.execute(
            sa.text(
                "UPDATE products SET is_active = false, "
                "url = LEFT(url, 2000) || '#duplicado-' || CAST(id AS TEXT) WHERE id = :id"
            ),
            {"id": product_id},
        )
    for product_id, canonical in renames:
        bind.execute(
            sa.text("UPDATE products SET url = :url WHERE id = :id"),
            {"url": canonical, "id": product_id},
        )

    bind.execute(
        sa.text(
            "UPDATE products SET was_below_desired = "
            "(last_price IS NOT NULL AND last_price <= desired_price AND last_status = 'ok')"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_price_history_product_checked", table_name="price_history")
    op.drop_column("alerts", "next_attempt_at")
    op.drop_column("alerts", "last_attempt_at")
    op.drop_column("alerts", "attempts")
