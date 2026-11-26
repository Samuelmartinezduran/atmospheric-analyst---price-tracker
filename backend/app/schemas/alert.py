from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_serializer


class AlertResponse(BaseModel):
    id: int
    product_id: int
    product_title: str | None
    product_url: str
    desired_price: Decimal
    triggered_price: Decimal
    currency: str
    status: str
    attempts: int
    error_message: str | None
    triggered_at: datetime
    sent_at: datetime | None

    @field_serializer("desired_price", "triggered_price")
    def _serialize(self, value: Decimal) -> float:
        return float(value)
