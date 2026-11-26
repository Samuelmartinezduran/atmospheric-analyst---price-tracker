import pytest

from app.scrapers.urls import (
    AMAZON_ES,
    PCCOMPONENTES,
    UnsupportedUrlError,
    extract_asin,
    is_allowed_final_url,
    normalize_product_url,
)


@pytest.mark.parametrize(
    "url",
    [
        # Regresión SSRF: antes bastaba con que «amazon.es» apareciera en cualquier parte.
        "http://169.254.169.254/latest/meta-data?x=amazon.es",
        "http://postgres:5432/amazon.es/dp/B0DTHV8THW",
        "https://evil.example/www.amazon.es/dp/B0DTHV8THW",
        "https://www.amazon.es.evil.example/dp/B0DTHV8THW",
        "https://notpccomponentes.com/producto",
        "https://pccomponentes.com.evil.example/producto",
        "https://user:pass@www.amazon.es/dp/B0DTHV8THW",
        "https://www.amazon.es:8443/dp/B0DTHV8THW",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "ftp://www.amazon.es/dp/B0DTHV8THW",
        "https://www.amazon.com/dp/B0DTHV8THW",  # otra tienda de Amazon: no soportada
        "",
    ],
)
def test_rejects_urls_outside_supported_stores(url: str) -> None:
    with pytest.raises(UnsupportedUrlError):
        normalize_product_url(url)


@pytest.mark.parametrize(
    ("url", "canonical"),
    [
        (
            "https://www.amazon.es/ASUS-GeForce-Tarjeta-Ventiladores-Axial-Tech/dp/B0DTHV8THW/ref=sr_1_1_mod_primary_new?crid=X&th=1",
            "https://www.amazon.es/dp/B0DTHV8THW",
        ),
        ("https://amazon.es/dp/b0dthv8thw", "https://www.amazon.es/dp/B0DTHV8THW"),
        ("www.amazon.es/gp/product/B0DTHV8THW?psc=1", "https://www.amazon.es/dp/B0DTHV8THW"),
        ("https://m.amazon.es/gp/aw/d/B0DTHV8THW", "https://www.amazon.es/dp/B0DTHV8THW"),
    ],
)
def test_amazon_urls_are_canonicalized_to_asin(url: str, canonical: str) -> None:
    store, normalized = normalize_product_url(url)
    assert store is AMAZON_ES
    assert normalized == canonical


def test_same_amazon_product_with_different_tracking_params_is_the_same_url() -> None:
    _, a = normalize_product_url("https://www.amazon.es/dp/B0DTHV8THW/ref=abc?tag=1")
    _, b = normalize_product_url("https://www.amazon.es/Cualquier-Cosa/dp/B0DTHV8THW?th=1&psc=1")
    assert a == b


def test_amazon_url_without_asin_is_rejected_with_a_helpful_message() -> None:
    with pytest.raises(UnsupportedUrlError, match="/dp/"):
        normalize_product_url("https://www.amazon.es/s?k=rtx+5090")


def test_pccomponentes_url_loses_query_and_fragment() -> None:
    store, normalized = normalize_product_url(
        "http://pccomponentes.com//tarjeta-grafica-asus-dual/?utm_source=x#opiniones"
    )
    assert store is PCCOMPONENTES
    assert normalized == "https://www.pccomponentes.com/tarjeta-grafica-asus-dual"


def test_pccomponentes_home_is_not_a_product() -> None:
    with pytest.raises(UnsupportedUrlError):
        normalize_product_url("https://www.pccomponentes.com/")


def test_extract_asin() -> None:
    assert extract_asin("https://www.amazon.es/x/dp/B0DTHV8THW/ref=1") == "B0DTHV8THW"
    assert extract_asin("https://www.amazon.es/s?k=algo") is None


@pytest.mark.parametrize(
    ("url", "allowed"),
    [
        ("https://www.amazon.es/dp/B0DTHV8THW", True),
        ("https://www.pccomponentes.com/algo", True),
        ("https://www.amazon.es/ap/signin?openid=1", True),
        ("http://169.254.169.254/latest", False),
        ("https://phishing.example/amazon.es", False),
        ("about:blank", False),
    ],
)
def test_final_url_after_redirects_must_stay_in_store(url: str, allowed: bool) -> None:
    assert is_allowed_final_url(url) is allowed
