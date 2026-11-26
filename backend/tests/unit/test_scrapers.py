"""Parseo de páginas con HTML mínimo que imita la estructura real de cada tienda.

No se guardan páginas reales completas (pesan 1-2 MB y cambian cada semana);
cada fixture reproduce solo la parte que importa y la trampa que se quiere evitar.
"""

import json
from decimal import Decimal

import pytest

from app.scrapers.amazon import AmazonEsScraper
from app.scrapers.base import BlockedError, ScraperError
from app.scrapers.pccomponentes import PcComponentesScraper

PADDING = "<p>" + "relleno " * 50 + "</p>"


def amazon_page(body: str) -> str:
    return f"<html><head><title>Amazon.es</title></head><body>{PADDING}{body}</body></html>"


def pcc_page(json_ld: dict | None, body: str = "") -> str:
    script = f'<script type="application/ld+json">{json.dumps(json_ld)}</script>' if json_ld else ""
    return f"<html><head>{script}<meta property='og:image' content='https://img.pccomponentes.com/x.jpg'></head><body>{PADDING}{body}</body></html>"


class TestAmazon:
    scraper = AmazonEsScraper()

    def test_reads_buybox_price_not_the_first_price_on_the_page(self) -> None:
        html = amazon_page(
            """
            <div id="sims"><span class="a-price"><span class="a-offscreen">19,99 €</span></span></div>
            <span id="productTitle">  ASUS ROG Astral GeForce RTX 5090  </span>
            <div id="corePriceDisplay_desktop_feature_div">
              <span class="priceToPay"><span class="a-offscreen">9.744,15€</span></span>
            </div>
            <div id="availability"><span>Sólo queda(n) 3 en stock.</span></div>
            """
        )
        result = self.scraper.parse_from_html(html)
        assert result.price == Decimal("9744.15")
        assert result.title == "ASUS ROG Astral GeForce RTX 5090"
        assert result.in_stock is True

    def test_price_without_cents_is_not_read_as_decimals(self) -> None:
        html = amazon_page(
            """<span id="productTitle">Portátil</span>
            <div id="corePrice_feature_div"><span class="a-offscreen">2.499 €</span></div>"""
        )
        assert self.scraper.parse_from_html(html).price == Decimal("2499.00")

    def test_split_whole_and_fraction_inside_buybox(self) -> None:
        html = amazon_page(
            """<span id="productTitle">Monitor</span>
            <div id="corePrice_feature_div">
              <span class="a-price-whole">1.299,</span><span class="a-price-fraction">90</span>
            </div>"""
        )
        assert self.scraper.parse_from_html(html).price == Decimal("1299.90")

    def test_out_of_stock(self) -> None:
        html = amazon_page(
            """<span id="productTitle">Consola</span>
            <div id="availability"><span>Actualmente no disponible.</span></div>"""
        )
        result = self.scraper.parse_from_html(html)
        assert result.in_stock is False
        assert result.price is None

    def test_captcha_is_reported_as_blocked(self) -> None:
        html = amazon_page(
            """<form action="/errors/validateCaptcha"><p>Introduce los caracteres que ves a continuación</p></form>"""
        )
        with pytest.raises(BlockedError):
            self.scraper.parse_from_html(html)

    def test_no_price_and_no_stock_info_is_an_error(self) -> None:
        with pytest.raises(ScraperError):
            self.scraper.parse_from_html(amazon_page('<span id="productTitle">Algo</span>'))


class TestPcComponentes:
    scraper = PcComponentesScraper()

    def product(self, offers) -> dict:
        return {"@context": "https://schema.org", "@type": "Product", "name": "ASUS Dual RTX 5070", "offers": offers}

    def test_reads_json_ld_price_in_machine_format(self) -> None:
        html = pcc_page(
            self.product({"@type": "Offer", "price": "1099.95", "availability": "https://schema.org/InStock"}),
            "<h1 data-testid='product-title'>ASUS Dual GeForce RTX 5070</h1>",
        )
        result = self.scraper.parse_from_html(html)
        assert result.price == Decimal("1099.95")
        assert result.in_stock is True
        assert result.title == "ASUS Dual GeForce RTX 5070"
        assert result.image_url == "https://img.pccomponentes.com/x.jpg"

    def test_prefers_low_price_over_high_price_in_aggregate_offers(self) -> None:
        html = pcc_page(self.product({"@type": "AggregateOffer", "lowPrice": 629, "highPrice": 799}))
        assert self.scraper.parse_from_html(html).price == Decimal("629.00")

    def test_out_of_stock_from_json_ld_even_if_price_is_present(self) -> None:
        html = pcc_page(
            self.product({"@type": "Offer", "price": "649.00", "availability": "https://schema.org/OutOfStock"})
        )
        result = self.scraper.parse_from_html(html)
        assert result.in_stock is False
        assert result.price is None

    def test_words_like_no_disponible_elsewhere_do_not_mark_out_of_stock(self) -> None:
        # Antes bastaba con que «no disponible» apareciera en cualquier parte de la página.
        html = pcc_page(
            self.product({"@type": "Offer", "price": "649.00", "availability": "https://schema.org/InStock"}),
            "<div>Envío a Canarias no disponible</div>",
        )
        assert self.scraper.parse_from_html(html).in_stock is True

    def test_json_ld_inside_graph(self) -> None:
        html = pcc_page({"@context": "https://schema.org", "@graph": [self.product({"price": 99.9})]})
        assert self.scraper.parse_from_html(html).price == Decimal("99.90")

    def test_falls_back_to_visible_spanish_price(self) -> None:
        html = pcc_page(
            None,
            "<h1>RAM</h1><div id='pdp-price-current-integer'>1.429<span>,</span><span>95</span> €</div>",
        )
        assert self.scraper.parse_from_html(html).price == Decimal("1429.95")

    def test_no_price_is_an_error(self) -> None:
        with pytest.raises(ScraperError):
            self.scraper.parse_from_html(pcc_page(None, "<h1>Nada</h1>"))
