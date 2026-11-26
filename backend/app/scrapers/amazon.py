import json
from decimal import Decimal

from bs4 import BeautifulSoup

from app.scrapers.base import BaseStoreScraper, BlockedError, BrowserSession, ScraperError, ScrapeResult
from app.scrapers.prices import PriceFormat, try_parse_price
from app.scrapers.urls import AMAZON_ES, extract_asin

# El precio se busca SOLO dentro de los bloques de la caja de compra. Antes se usaba el
# primer `span.a-price` de la página, que puede ser el de un producto recomendado o el
# precio por unidad.
BUYBOX_PRICE_SELECTORS = (
    "#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen",
    "#corePrice_feature_div .a-offscreen",
    "#apex_desktop .priceToPay .a-offscreen",
    "#apex_offerDisplay_desktop .priceToPay .a-offscreen",
    "#corePrice_mobile_feature_div .a-offscreen",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    "#price_inside_buybox",
)
BUYBOX_CONTAINERS = (
    "#corePriceDisplay_desktop_feature_div",
    "#corePrice_feature_div",
    "#apex_desktop",
    "#corePrice_mobile_feature_div",
)
MACHINE_PRICE_INPUTS = ("#twister-plus-price-data-price", "input#attach-base-product-price")

OUT_OF_STOCK_MARKERS = (
    "actualmente no disponible",
    "no disponible",
    "temporalmente sin stock",
    "currently unavailable",
    "temporarily out of stock",
)
BLOCK_MARKERS = (
    "/errors/validatecaptcha",
    "introduce los caracteres que ves",
    "type the characters you see",
    "api-services-support@amazon.com",
)


class AmazonEsScraper(BaseStoreScraper):
    store = AMAZON_ES

    def _extract_title(self, soup: BeautifulSoup) -> str | None:
        node = soup.select_one("#productTitle") or soup.select_one("#title")
        if node and node.get_text(strip=True):
            return self.clean_text(node.get_text(" ", strip=True))
        og_title = soup.select_one("meta[property='og:title']")
        if og_title and og_title.get("content"):
            return self.clean_text(og_title["content"])
        return None

    def _extract_image_url(self, soup: BeautifulSoup) -> str | None:
        node = soup.select_one("#landingImage") or soup.select_one("#imgTagWrapperId img")
        if node:
            dynamic = node.get("data-a-dynamic-image")
            if dynamic:
                try:
                    parsed = json.loads(dynamic)
                    if isinstance(parsed, dict) and parsed:
                        return self.normalize_image_url(next(iter(parsed)))
                except ValueError:
                    pass
            for attribute in ("data-old-hires", "src"):
                if node.get(attribute):
                    return self.normalize_image_url(node[attribute])
        og_image = soup.select_one("meta[property='og:image']")
        if og_image and og_image.get("content"):
            return self.normalize_image_url(og_image["content"])
        return None

    def _extract_price(self, soup: BeautifulSoup) -> Decimal | None:
        for selector in BUYBOX_PRICE_SELECTORS:
            node = soup.select_one(selector)
            if node:
                price = try_parse_price(node.get_text(" ", strip=True), PriceFormat.ES)
                if price is not None:
                    return price

        # Precio partido en entero y fracción, dentro de la caja de compra.
        for container_selector in BUYBOX_CONTAINERS:
            container = soup.select_one(container_selector)
            if not container:
                continue
            whole = container.select_one(".a-price-whole")
            fraction = container.select_one(".a-price-fraction")
            if whole:
                whole_text = whole.get_text(strip=True).rstrip(",.")
                fraction_text = fraction.get_text(strip=True) if fraction else "00"
                price = try_parse_price(f"{whole_text},{fraction_text}", PriceFormat.ES)
                if price is not None:
                    return price

        for selector in MACHINE_PRICE_INPUTS:
            node = soup.select_one(selector)
            if node and node.get("value"):
                price = try_parse_price(node["value"], PriceFormat.MACHINE)
                if price is not None:
                    return price

        for offer in self.iter_json_ld_offers(soup):
            price = try_parse_price(offer.get("price"), PriceFormat.MACHINE)
            if price is not None:
                return price
        return None

    def _is_out_of_stock(self, soup: BeautifulSoup) -> bool:
        node = soup.select_one("#availability")
        text = node.get_text(" ", strip=True).lower() if node else ""
        return any(marker in text for marker in OUT_OF_STOCK_MARKERS)

    def parse_from_html(self, html: str) -> ScrapeResult:
        lowered = html.lower()
        if any(marker in lowered for marker in BLOCK_MARKERS) and 'id="producttitle"' not in lowered:
            raise BlockedError(
                "Amazon ha pedido un captcha: está bloqueando las comprobaciones automáticas desde esta IP. "
                "Se reintentará en la próxima ronda; si se repite, configura SCRAPER_PROXY_SERVER."
            )
        try:
            soup = BeautifulSoup(html, "html.parser")
            title = self._extract_title(soup)
            image_url = self._extract_image_url(soup)
            price = self._extract_price(soup)
            out_of_stock = self._is_out_of_stock(soup)
        except Exception as exc:
            raise ScraperError(f"Error al leer la página de Amazon ES: {exc}") from exc

        if price is not None and not out_of_stock:
            return ScrapeResult(title=title, image_url=image_url, price=price, currency="EUR", in_stock=True)
        if out_of_stock:
            return ScrapeResult(title=title, image_url=image_url, price=None, currency="EUR", in_stock=False)
        raise ScraperError("No se encontró el precio en Amazon ES.")

    def fetch(self, url: str, browser: BrowserSession) -> ScrapeResult:
        try:
            return self.parse_from_html(browser.fetch_html(url))
        except BlockedError as primary_error:
            # La versión móvil a veces se salva del captcha.
            asin = extract_asin(url)
            if not asin:
                raise
            try:
                return self.parse_from_html(browser.fetch_html(f"https://www.amazon.es/gp/aw/d/{asin}"))
            except ScraperError as fallback_error:
                raise BlockedError(
                    f"{primary_error} (La versión móvil también falló: {fallback_error})"
                ) from fallback_error
