from decimal import Decimal

import pytest

from app.scrapers.prices import PriceFormat, PriceParseError, parse_price, try_parse_price

ES = PriceFormat.ES
MACHINE = PriceFormat.MACHINE


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Regresión: el parser antiguo leía «2.499€» como 2,50 € y «1.234 €» como 1,23 €.
        ("2.499€", "2499.00"),
        ("1.234 €", "1234.00"),
        ("1.099,95 €", "1099.95"),
        ("9.744,15\xa0€", "9744.15"),
        ("123.456,78 €", "123456.78"),
        ("19,99€", "19.99"),
        ("19,9 €", "19.90"),
        ("649", "649.00"),
        ("649 €", "649.00"),
        ("1 099,95 €", "1099.95"),
        ("1 099,95 €", "1099.95"),
        ("EUR 49,90", "49.90"),
        ("  89,00 euros ", "89.00"),
    ],
)
def test_spanish_text_prices(raw: str, expected: str) -> None:
    assert parse_price(raw, ES) == Decimal(expected)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1099.95", "1099.95"),
        ("2499", "2499.00"),
        ("0.99", "0.99"),
        (1099.95, "1099.95"),
        (2499, "2499.00"),
        ("1099.9", "1099.90"),
    ],
)
def test_machine_prices(raw, expected: str) -> None:
    assert parse_price(raw, MACHINE) == Decimal(expected)


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "sin precio",
        "Agotado",
        "0,00 €",
        "-5,00 €",
        "12.5",  # en texto español un punto con menos de tres cifras detrás es ambiguo: se rechaza
        "1.23,45",
        "1,234.56",  # formato inglés en una tienda española: se rechaza en vez de adivinar
        "19,999",
        "1.000.000,00 €",  # fuera de rango
    ],
)
def test_invalid_spanish_prices(raw: str) -> None:
    with pytest.raises(PriceParseError):
        parse_price(raw, ES)


@pytest.mark.parametrize("raw", ["1.099,95", "1,099.95", "abc", "", None, True, "-1", "0", "0.001", "1e3"])
def test_invalid_machine_prices(raw) -> None:
    with pytest.raises(PriceParseError):
        parse_price(raw, MACHINE)


def test_try_parse_price_returns_none_instead_of_raising() -> None:
    assert try_parse_price("sin precio", ES) is None
    assert try_parse_price("2.499€", ES) == Decimal("2499.00")


def test_result_has_exactly_two_decimals() -> None:
    value = parse_price("2499", MACHINE)
    assert value.as_tuple().exponent == -2
    assert str(value) == "2499.00"
