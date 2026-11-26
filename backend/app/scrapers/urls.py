"""Validación y normalización de URLs de producto.

Solo se aceptan URLs http(s) cuyo *host* sea exactamente uno de los dominios
de una tienda soportada. Antes bastaba con que el texto «amazon.es» apareciera
en cualquier parte de la URL, así que el servidor abría con Chromium cosas como
``http://169.254.169.254/?x=amazon.es`` (SSRF).
"""

import re
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit


class UnsupportedUrlError(ValueError):
    pass


@dataclass(frozen=True)
class StoreInfo:
    code: str
    name: str
    domains: tuple[str, ...]
    example_url: str


AMAZON_ES = StoreInfo(
    code="amazon_es",
    name="Amazon ES",
    domains=("amazon.es", "www.amazon.es", "m.amazon.es", "smile.amazon.es"),
    example_url="https://www.amazon.es/dp/B0DTHV8THW",
)
PCCOMPONENTES = StoreInfo(
    code="pccomponentes",
    name="PCComponentes",
    domains=("pccomponentes.com", "www.pccomponentes.com"),
    example_url="https://www.pccomponentes.com/tarjeta-grafica-asus-dual-geforce-rtx-5070-oc-12gb-gddr7-reflex-2-rtx-ai-dlss4",
)
STORES: tuple[StoreInfo, ...] = (AMAZON_ES, PCCOMPONENTES)

_ASIN_PATTERNS = (
    re.compile(r"/dp/([A-Z0-9]{10})(?:[/?]|$)", re.IGNORECASE),
    re.compile(r"/gp/product/([A-Z0-9]{10})(?:[/?]|$)", re.IGNORECASE),
    re.compile(r"/gp/aw/d/([A-Z0-9]{10})(?:[/?]|$)", re.IGNORECASE),
    re.compile(r"/exec/obidos/asin/([A-Z0-9]{10})(?:[/?]|$)", re.IGNORECASE),
)


def _split(url: str):
    candidate = url.strip()
    if not candidate:
        raise UnsupportedUrlError("La URL no puede estar vacía.")
    if "://" not in candidate:
        candidate = "https://" + candidate
    try:
        parts = urlsplit(candidate)
        port = parts.port
    except ValueError as exc:
        raise UnsupportedUrlError("La URL no es válida.") from exc
    if parts.scheme.lower() not in {"http", "https"}:
        raise UnsupportedUrlError("Solo se admiten enlaces http o https.")
    if parts.username or parts.password:
        raise UnsupportedUrlError("La URL no puede llevar usuario ni contraseña.")
    if port not in (None, 80, 443):
        raise UnsupportedUrlError("La URL no puede llevar un puerto propio.")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise UnsupportedUrlError("La URL no tiene dominio.")
    return parts, host


def store_for_host(host: str) -> StoreInfo | None:
    host = host.lower().rstrip(".")
    for store in STORES:
        if host in store.domains:
            return store
    return None


def extract_asin(url: str) -> str | None:
    path = urlsplit(url).path if "://" in url else url
    for pattern in _ASIN_PATTERNS:
        match = pattern.search(path)
        if match:
            return match.group(1).upper()
    return None


def normalize_product_url(url: str) -> tuple[StoreInfo, str]:
    """Devuelve la tienda y la URL canónica del producto, o lanza ``UnsupportedUrlError``."""
    parts, host = _split(url)
    store = store_for_host(host)
    if store is None:
        supported = ", ".join(s.name for s in STORES)
        raise UnsupportedUrlError(f"La URL no es de una tienda soportada ({supported}).")

    if store is AMAZON_ES:
        asin = extract_asin(parts.path)
        if not asin:
            raise UnsupportedUrlError(
                "No encuentro el código del producto (ASIN) en el enlace de Amazon. "
                "Usa el enlace de la página del producto, el que contiene /dp/."
            )
        return store, f"https://www.amazon.es/dp/{asin}"

    path = re.sub(r"/{2,}", "/", parts.path).rstrip("/")
    if not path:
        raise UnsupportedUrlError("Ese enlace es la portada de la tienda, no un producto.")
    return store, urlunsplit(("https", "www.pccomponentes.com", path, "", ""))


def is_allowed_final_url(url: str) -> bool:
    """Tras las redirecciones del navegador, la página tiene que seguir en una tienda soportada."""
    try:
        _, host = _split(url)
    except UnsupportedUrlError:
        return False
    return store_for_host(host) is not None
