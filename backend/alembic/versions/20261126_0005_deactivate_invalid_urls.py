"""desactiva productos con URLs que hoy no pasarían la validación

Revision ID: 20261126_0005
Revises: 20261126_0004
Create Date: 2026-11-26

El código antiguo aceptaba cualquier URL que contuviera «amazon.es» o
«pccomponentes.com» en cualquier parte (SSRF). Esas filas no se borran, para no
perder historial: se desactivan y se explica el motivo en last_error. El worker,
además, vuelve a validar cada URL antes de abrirla.

La validación se copia aquí a propósito, como en la 0004.
"""

from collections.abc import Sequence
from urllib.parse import urlsplit

import sqlalchemy as sa

from alembic import op

revision: str = "20261126_0005"
down_revision: str | Sequence[str] | None = "20261126_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_HOSTS = {
    "amazon_es": ("www.amazon.es",),
    "pccomponentes": ("www.pccomponentes.com",),
}
REASON = "URL no válida; el producto se ha desactivado al actualizar la app. Vuelve a añadirlo con su enlace."


def _is_valid(url: str, store: str) -> bool:
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    return (
        parts.scheme == "https"
        and port is None
        and not parts.username
        and not parts.password
        and (parts.hostname or "") in _HOSTS.get(store, ())
    )


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, url, store FROM products WHERE is_active")).all()
    for row in rows:
        if not _is_valid(row.url, row.store):
            bind.execute(
                sa.text(
                    "UPDATE products SET is_active = false, last_status = 'error', last_error = :reason WHERE id = :id"
                ),
                {"reason": REASON, "id": row.id},
            )


def downgrade() -> None:
    # No se reactivan: eran URLs peligrosas.
    pass
