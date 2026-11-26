"""Interpretación de precios.

La lógica vive en el crate de Rust `precio/` (ver D6 y D10 en docs/DECISIONES.md);
este módulo solo adapta tipos y traduce los errores a mensajes en español.

Cada scraper sabe de dónde saca un precio y se lo dice al parser:

- ``PriceFormat.MACHINE``: datos estructurados (JSON-LD, metaetiquetas,
  atributos ``content``). El punto es decimal y no hay separador de miles:
  ``1099.95``, ``2499``.
- ``PriceFormat.ES``: texto visible en una tienda española. El punto separa
  miles y la coma separa decimales: ``1.099,95 €``, ``2.499€``, ``19,99``.

El parser anterior adivinaba el formato y convertía ``2.499€`` en 2,50 €.
"""

from decimal import Decimal
from enum import Enum

import precio

MESSAGES = {
    "empty": "Precio vacío",
    "invalid_machine": "Precio en formato de datos no válido",
    "invalid_es": "Precio en formato español no válido",
    "not_positive": "Precio no positivo",
    "out_of_range": "Precio fuera de rango",
}


class PriceFormat(str, Enum):
    MACHINE = "machine"
    ES = "es"


class PriceParseError(ValueError):
    pass


def parse_price(raw: str | int | float | None, fmt: PriceFormat) -> Decimal:
    """Convierte un precio a ``Decimal`` con dos decimales o lanza ``PriceParseError``."""
    if raw is None:
        raise PriceParseError("Precio vacío.")
    if isinstance(raw, bool):
        raise PriceParseError(f"Precio no válido: {raw!r}")
    if isinstance(raw, float):
        text = repr(raw)
    elif isinstance(raw, int):
        text = str(raw)
    elif isinstance(raw, str):
        text = raw
    else:
        # El JSON-LD a veces trae objetos o listas donde debería haber un número.
        raise PriceParseError(f"Precio con un tipo inesperado: {type(raw).__name__}")

    try:
        cents = precio.parse_cents(text, fmt.value)
    except ValueError as exc:
        code = str(exc)
        raise PriceParseError(f"{MESSAGES.get(code, code)}: {raw!r}") from None
    return Decimal(cents).scaleb(-2)


def try_parse_price(raw: str | int | float | None, fmt: PriceFormat) -> Decimal | None:
    try:
        return parse_price(raw, fmt)
    except PriceParseError:
        return None
