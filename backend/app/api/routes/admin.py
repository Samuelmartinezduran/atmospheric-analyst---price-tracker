"""Panel de administración: estado general y gestión de cuentas."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import AdminUser, DbSession
from app.core.config import get_settings
from app.db.models import Alert, PriceHistory, Product, User, UserSession
from app.schemas.admin import AdminOverview, AdminTotals, AdminUserRow

router = APIRouter(prefix="/admin")


@router.get("/overview", response_model=AdminOverview)
def overview(_: AdminUser, db: DbSession) -> AdminOverview:
    settings = get_settings()
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    def count(query) -> int:
        return int(db.scalar(query) or 0)

    alerts_by_status = dict(db.execute(select(Alert.status, func.count()).group_by(Alert.status)).all())
    totals = AdminTotals(
        users=count(select(func.count()).select_from(User)),
        verified_users=count(select(func.count()).select_from(User).where(User.is_email_verified.is_(True))),
        products=count(select(func.count()).select_from(Product)),
        active_products=count(select(func.count()).select_from(Product).where(Product.is_active.is_(True))),
        checks_24h=count(select(func.count()).select_from(PriceHistory).where(PriceHistory.checked_at >= since)),
        failed_checks_24h=count(
            select(func.count())
            .select_from(PriceHistory)
            .where(PriceHistory.checked_at >= since, PriceHistory.status == "error")
        ),
        alerts_pending=alerts_by_status.get("pending", 0),
        alerts_failed=alerts_by_status.get("failed", 0),
        alerts_sent=alerts_by_status.get("sent", 0),
    )

    product_counts = select(Product.user_id, func.count().label("n")).group_by(Product.user_id).subquery()
    last_logins = (
        select(UserSession.user_id, func.max(UserSession.created_at).label("at"))
        .group_by(UserSession.user_id)
        .subquery()
    )
    rows = db.execute(
        select(User, product_counts.c.n, last_logins.c.at)
        .outerjoin(product_counts, product_counts.c.user_id == User.id)
        .outerjoin(last_logins, last_logins.c.user_id == User.id)
        .order_by(User.created_at.asc(), User.id.asc())
    ).all()

    return AdminOverview(
        totals=totals,
        last_check_at=db.scalar(select(func.max(Product.last_checked_at))),
        email_enabled=settings.email_enabled,
        check_interval_minutes=settings.check_interval_minutes,
        users=[
            AdminUserRow(
                id=user.id,
                email=user.email,
                is_email_verified=user.is_email_verified,
                is_active=user.is_active,
                is_admin=user.is_admin,
                created_at=user.created_at,
                products=products or 0,
                last_login_at=last_login,
            )
            for user, products, last_login in rows
        ],
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: AdminUser, db: DbSession) -> None:
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes borrar tu propia cuenta desde aquí."
        )
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
    # Borra en cascada sus productos, historial, alertas y sesiones.
    db.delete(user)
    db.commit()
