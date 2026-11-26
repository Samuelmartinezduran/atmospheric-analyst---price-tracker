from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer


class SummaryCounts(BaseModel):
    total: int = 0
    below_target: int = 0
    above_target: int = 0
    unavailable: int = 0
    error: int = 0
    never_checked: int = 0


class AlertCounts(BaseModel):
    pending: int = 0
    sent: int = 0
    failed: int = 0


class SummaryResponse(BaseModel):
    products: SummaryCounts
    alerts: AlertCounts = AlertCounts()
    expected_checks_24h: int = 0
    checks_24h: int
    failed_checks_24h: int
    last_check_at: datetime | None
    next_check_at: datetime | None
    check_interval_minutes: int
    email_enabled: bool


class ReadingResponse(BaseModel):
    id: int
    product_id: int
    product_title: str | None
    store: str
    price: Decimal | None
    previous_price: Decimal | None
    desired_price: Decimal
    status: str
    error_message: str | None
    checked_at: datetime

    @field_serializer("price", "previous_price", "desired_price")
    def _serialize(self, value: Decimal | None) -> float | None:
        return None if value is None else float(value)
