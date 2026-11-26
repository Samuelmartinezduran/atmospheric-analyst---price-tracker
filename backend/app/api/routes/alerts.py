from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import Alert, Product
from app.schemas.alert import AlertResponse

router = APIRouter()


@router.get("/alerts", response_model=list[AlertResponse])
def list_alerts(user: CurrentUser, db: DbSession) -> list[AlertResponse]:
    rows = db.execute(
        select(Alert, Product)
        .join(Product, Product.id == Alert.product_id)
        .where(Alert.user_id == user.id)
        .order_by(Alert.triggered_at.desc(), Alert.id.desc())
        .limit(200)
    ).all()
    return [
        AlertResponse(
            id=alert.id,
            product_id=alert.product_id,
            product_title=product.title,
            product_url=product.url,
            desired_price=alert.desired_price,
            triggered_price=alert.triggered_price,
            currency=alert.currency,
            status=alert.status,
            attempts=alert.attempts,
            error_message=alert.error_message,
            triggered_at=alert.triggered_at,
            sent_at=alert.sent_at,
        )
        for alert, product in rows
    ]
