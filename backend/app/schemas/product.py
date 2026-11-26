from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

PRICE_FIELD = Field(gt=0, lt=Decimal("1000000"), max_digits=9, decimal_places=2)


class ProductCreateRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    desired_price: Decimal = PRICE_FIELD


class ProductUpdateRequest(BaseModel):
    desired_price: Decimal | None = PRICE_FIELD


def _to_float(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


class PriceStatsResponse(BaseModel):
    lowest_price: Decimal | None = None
    lowest_price_at: datetime | None = None
    highest_price: Decimal | None = None
    avg_price_30d: Decimal | None = None
    checks_count: int = 0

    @field_serializer("lowest_price", "highest_price", "avg_price_30d")
    def _serialize(self, value: Decimal | None) -> float | None:
        return _to_float(value)


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    store: str
    title: str | None
    image_url: str | None
    desired_price: Decimal
    last_price: Decimal | None
    previous_price: Decimal | None = None
    currency: str
    last_status: str
    last_error: str | None
    last_checked_at: datetime | None
    is_below_target: bool = False
    stats: PriceStatsResponse = PriceStatsResponse()
    # Últimas 30 lecturas con precio, en orden cronológico: [[fecha ISO, precio], ...]
    spark: list[tuple[datetime, float]] = []
    created_at: datetime
    updated_at: datetime

    @field_serializer("desired_price", "last_price", "previous_price")
    def _serialize(self, value: Decimal | None) -> float | None:
        return _to_float(value)


class StoreResponse(BaseModel):
    code: str
    name: str
    domains: list[str]
    example_url: str
