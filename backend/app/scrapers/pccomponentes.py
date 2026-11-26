from decimal import Decimal

from bs4 import BeautifulSoup

from app.scrapers.base import BaseStoreScraper, ScraperError, ScrapeResult
from app.scrapers.prices import PriceFormat, try_parse_price
from app.scrapers.urls import PCCOMPONENTES

OUT_OF_STOCK_AVAILABILITY = ("outofstock", "soldout", "discontinued")


class PcComponentesScraper(BaseStoreScraper):
    """PCComponentes publica JSON-LD de schema.org con precio y disponibilidad.

    En noviembre de 2026 ninguno de los selectores CSS antiguos encontraba el
    precio; solo funcionaba el JSON-LD, así que es la fuente principal. Los
    selectores quedan como respaldo.
    """

    store = PCCOMPONENTES

    def _extract_title(self, soup: BeautifulSoup) -> str | None:
        for selector in ("h1[data-testid='product-title']", "h1[itemprop='name']", "h1"):
            node = soup.select_one(selector)
            if node and node.get_text(strip=True):
                return self.clean_text(node.get_text(" ", strip=True))
        og_title = soup.select_one("meta[property='og:title']")
        if og_title and og_title.get("content"):
            return self.clean_text(og_title["content"])
        return None

    def _extract_image_url(self, soup: BeautifulSoup) -> str | None:
        og_image = soup.select_one("meta[property='og:image']")
        if og_image and og_image.get("content"):
            return self.normalize_image_url(og_image["content"])
        node = soup.select_one("img[itemprop='image']") or soup.select_one("[data-testid='product-image'] img")
        if node:
            return self.normalize_image_url(node.get("src") or node.get("data-src"))
        return None

    def _from_json_ld(self, soup: BeautifulSoup) -> tuple[Decimal | None, bool | None]:
        """Devuelve (precio, en_stock) de la primera oferta con datos útiles."""
        for offer in self.iter_json_ld_offers(soup):
            availability = str(offer.get("availability") or "").lower()
            in_stock = None
            if availability:
                in_stock = not any(marker in availability for marker in OUT_OF_STOCK_AVAILABILITY)
            # Primero el precio de la oferta; lowPrice solo en ofertas agregadas. Nunca highPrice.
            for key in ("price", "lowPrice"):
                price = try_parse_price(offer.get(key), PriceFormat.MACHINE)
                if price is not None:
                    return price, in_stock
            if in_stock is False:
                return None, False
        return None, None

    def _from_markup(self, soup: BeautifulSoup) -> Decimal | None:
        for selector in ("[itemprop='price']", "meta[property='product:price:amount']"):
            node = soup.select_one(selector)
            if node and node.get("content"):
                price = try_parse_price(node["content"], PriceFormat.MACHINE)
                if price is not None:
                    return price
        for selector in ("#pdp-price-current-integer", "[data-testid='price-current']", ".price-current"):
            node = soup.select_one(selector)
            if node:
                price = try_parse_price(node.get_text(" ", strip=True), PriceFormat.ES)
                if price is not None:
                    return price
        return None

    def parse_from_html(self, html: str) -> ScrapeResult:
        try:
            soup = BeautifulSoup(html, "html.parser")
            title = self._extract_title(soup)
            image_url = self._extract_image_url(soup)
            price, in_stock = self._from_json_ld(soup)
            if price is None and in_stock is not False:
                price = self._from_markup(soup)
        except Exception as exc:
            raise ScraperError(f"Error al leer la página de PCComponentes: {exc}") from exc

        if in_stock is False:
            return ScrapeResult(title=title, image_url=image_url, price=None, currency="EUR", in_stock=False)
        if price is not None:
            return ScrapeResult(title=title, image_url=image_url, price=price, currency="EUR", in_stock=True)
        raise ScraperError("No se encontró el precio en PCComponentes.")
