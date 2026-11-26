import json
import logging
import time
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal

from bs4 import BeautifulSoup

from app.core.config import get_settings
from app.scrapers.urls import StoreInfo, is_allowed_final_url

logger = logging.getLogger(__name__)


class ScraperError(Exception):
    pass


class BlockedError(ScraperError):
    """La tienda ha detectado el navegador automático y no enseña el producto."""


@dataclass
class ScrapeResult:
    title: str | None
    image_url: str | None
    price: Decimal | None
    currency: str
    in_stock: bool


class BrowserSession:
    """Un Chromium para toda una ronda de comprobaciones.

    Antes se lanzaba un navegador nuevo por producto y por reintento. Ahora se
    lanza uno al entrar en el ``with`` y cada página usa un contexto nuevo
    (cookies limpias), que es barato.
    """

    def __init__(self) -> None:
        self._playwright_cm = None
        self._playwright = None
        self._browser = None
        self.settings = get_settings()

    def __enter__(self) -> "BrowserSession":
        from playwright.sync_api import sync_playwright

        self._playwright_cm = sync_playwright()
        self._playwright = self._playwright_cm.__enter__()
        launch_kwargs: dict = {
            "headless": True,
            "args": ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
        }
        proxy = self._proxy_settings()
        if proxy:
            launch_kwargs["proxy"] = proxy
        self._browser = self._playwright.chromium.launch(**launch_kwargs)
        return self

    def __exit__(self, *exc_info) -> None:
        try:
            if self._browser:
                self._browser.close()
        finally:
            if self._playwright_cm:
                self._playwright_cm.__exit__(*exc_info)

    def _proxy_settings(self) -> dict | None:
        server = self.settings.scraper_proxy_server.strip()
        if not server:
            return None
        proxy = {"server": server}
        if self.settings.scraper_proxy_username.strip():
            proxy["username"] = self.settings.scraper_proxy_username.strip()
        if self.settings.scraper_proxy_password.strip():
            proxy["password"] = self.settings.scraper_proxy_password.strip()
        return proxy

    def fetch_html(self, url: str) -> str:
        from playwright.sync_api import Error as PlaywrightError

        if self._browser is None:
            raise RuntimeError("BrowserSession debe usarse dentro de un bloque with.")

        max_attempts = max(1, self.settings.scraper_max_retries + 1)
        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            context = self._browser.new_context(
                user_agent=self.settings.scraper_user_agent,
                locale="es-ES",
                timezone_id=self.settings.timezone,
                viewport={"width": 1366, "height": 768},
                extra_http_headers={"Accept-Language": self.settings.scraper_accept_language},
            )
            try:
                page = context.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=self.settings.scraper_timeout_ms)
                if not is_allowed_final_url(page.url):
                    # No se reintenta: una redirección fuera de la tienda no se arregla sola.
                    raise ScraperError("La página redirigió fuera de la tienda; no se procesa.")
                page.wait_for_timeout(1200)
                html = page.content()
                if not html or len(html.strip()) < 200:
                    raise ScraperError("La tienda devolvió una página vacía o incompleta.")
                return html
            except ScraperError as exc:
                if "redirigió fuera" in str(exc):
                    raise
                last_error = exc
            except PlaywrightError as exc:
                last_error = exc
            finally:
                context.close()
            if attempt < max_attempts:
                logger.info("Reintentando %s (intento %s de %s): %s", url, attempt + 1, max_attempts, last_error)
                time.sleep(1.5 * attempt)
        raise ScraperError(f"No se pudo cargar la página tras {max_attempts} intentos: {last_error}")


class BaseStoreScraper(ABC):
    store: StoreInfo

    @property
    def store_code(self) -> str:
        return self.store.code

    @abstractmethod
    def parse_from_html(self, html: str) -> ScrapeResult:
        raise NotImplementedError

    def fetch(self, url: str, browser: BrowserSession) -> ScrapeResult:
        html = browser.fetch_html(url)
        return self.parse_from_html(html)

    # --- utilidades comunes de parseo ---

    @staticmethod
    def normalize_image_url(image_url: str | None) -> str | None:
        if not image_url:
            return None
        normalized = image_url.strip()
        if not normalized:
            return None
        if normalized.startswith("//"):
            normalized = f"https:{normalized}"
        if not normalized.startswith("https://"):
            return None
        return normalized[:2048]

    @staticmethod
    def clean_text(value: str | None, limit: int = 512) -> str | None:
        if not value:
            return None
        collapsed = " ".join(value.split())
        return collapsed[:limit] or None

    @staticmethod
    def iter_json_ld(soup: BeautifulSoup) -> Iterator[object]:
        for script in soup.select("script[type='application/ld+json']"):
            raw_json = (script.string or script.get_text() or "").strip()
            if not raw_json:
                continue
            try:
                yield json.loads(raw_json)
            except ValueError:
                continue

    @classmethod
    def iter_json_ld_offers(cls, soup: BeautifulSoup) -> Iterator[dict]:
        """Recorre los objetos `Product` del JSON-LD y devuelve sus ofertas."""

        def walk(node):
            if isinstance(node, list):
                for item in node:
                    yield from walk(item)
            elif isinstance(node, dict):
                types = node.get("@type")
                types = types if isinstance(types, list) else [types]
                if "Product" in types:
                    offers = node.get("offers")
                    offer_list = offers if isinstance(offers, list) else [offers]
                    for offer in offer_list:
                        if isinstance(offer, dict):
                            yield offer
                for key in ("@graph", "mainEntity", "itemListElement"):
                    if key in node:
                        yield from walk(node[key])

        for payload in cls.iter_json_ld(soup):
            yield from walk(payload)
