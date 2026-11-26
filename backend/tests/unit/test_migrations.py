"""Las funciones de normalización de las migraciones de datos (copiadas a propósito de la app)."""

import importlib.util
from pathlib import Path

import pytest

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"


def load(name: str):
    path = next(VERSIONS.glob(f"{name}*.py"))
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


m4 = load("20261126_0004")
m5 = load("20261126_0005")


@pytest.mark.parametrize(
    ("url", "store", "expected"),
    [
        ("https://www.amazon.es/Algo/dp/B0DTHV8THW/ref=x?th=1", "amazon_es", "https://www.amazon.es/dp/B0DTHV8THW"),
        ("https://www.amazon.es/exec/obidos/asin/B0DTHV8THW", "amazon_es", "https://www.amazon.es/dp/B0DTHV8THW"),
        ("www.pccomponentes.com/x/?utm=1", "pccomponentes", "https://www.pccomponentes.com/x"),
        # Hosts que no son de la tienda: no se tocan (la 0005 los desactiva).
        ("http://169.254.169.254/dp/B0DTHV8THW?x=amazon.es", "amazon_es", None),
        ("https://evil.example/x?pccomponentes.com", "pccomponentes", None),
        ("https://www.amazon.es/s?k=rtx", "amazon_es", None),
    ],
)
def test_0004_canonical(url, store, expected) -> None:
    assert m4._canonical(url, store) == expected


@pytest.mark.parametrize(
    ("url", "store", "valid"),
    [
        ("https://www.amazon.es/dp/B0DTHV8THW", "amazon_es", True),
        ("https://www.pccomponentes.com/x", "pccomponentes", True),
        ("http://169.254.169.254/latest?x=amazon.es", "amazon_es", False),
        ("https://www.amazon.es:8443/dp/B0DTHV8THW", "amazon_es", False),
        ("https://www.amazon.es/dp/B0DTHV8THW", "pccomponentes", False),
    ],
)
def test_0005_validation(url, store, valid) -> None:
    assert m5._is_valid(url, store) is valid
