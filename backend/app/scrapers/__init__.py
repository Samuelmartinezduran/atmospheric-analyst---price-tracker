from app.scrapers.amazon import AmazonEsScraper
from app.scrapers.base import BaseStoreScraper, BrowserSession, ScraperError, ScrapeResult
from app.scrapers.pccomponentes import PcComponentesScraper

_SCRAPERS: dict[str, BaseStoreScraper] = {
    scraper.store_code: scraper for scraper in (AmazonEsScraper(), PcComponentesScraper())
}


def scraper_for_store(store_code: str) -> BaseStoreScraper | None:
    return _SCRAPERS.get(store_code)


__all__ = ["BrowserSession", "ScrapeResult", "ScraperError", "scraper_for_store"]
