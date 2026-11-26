from datetime import datetime

from pydantic import BaseModel


class AdminTotals(BaseModel):
    users: int
    verified_users: int
    products: int
    active_products: int
    checks_24h: int
    failed_checks_24h: int
    alerts_pending: int
    alerts_failed: int
    alerts_sent: int


class AdminUserRow(BaseModel):
    id: int
    email: str
    is_email_verified: bool
    is_active: bool
    is_admin: bool
    created_at: datetime
    products: int
    last_login_at: datetime | None


class AdminOverview(BaseModel):
    totals: AdminTotals
    last_check_at: datetime | None
    email_enabled: bool
    check_interval_minutes: int
    users: list[AdminUserRow]
