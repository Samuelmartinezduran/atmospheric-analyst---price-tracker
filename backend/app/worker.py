"""Worker: comprueba precios periódicamente y envía las alertas pendientes.

Sustituye a n8n (ver D2 en docs/DECISIONES.md).

    python -m app.worker          # bucle infinito (servicio `worker` de Docker)
    python -m app.worker --once   # una sola ronda y sale (útil para probar)
"""

import argparse
import logging
import signal
import threading

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.services.alert_service import deliver_pending_alerts
from app.services.price_check_service import check_products, due_product_ids

logger = logging.getLogger("app.worker")
stop_event = threading.Event()


def run_round() -> None:
    with SessionLocal() as session:
        ids = due_product_ids(session)
        session.rollback()
        if ids:
            logger.info("Comprobando %s producto(s)...", len(ids))
            summary = check_products(session, ids)
            logger.info(
                "Ronda terminada: %s bien, %s con error, %s alertas nuevas, %s ocupados.",
                summary.checked_ok,
                summary.checked_failed,
                summary.alerts_created,
                summary.skipped,
            )
        delivery = deliver_pending_alerts(session)
        if delivery.sent or delivery.retried or delivery.failed:
            logger.info(
                "Alertas: %s enviadas, %s por reintentar, %s descartadas.",
                delivery.sent,
                delivery.retried,
                delivery.failed,
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Worker de comprobación de precios")
    parser.add_argument("--once", action="store_true", help="hace una sola ronda y termina")
    args = parser.parse_args()

    configure_logging()
    settings = get_settings()
    settings.assert_safe_for_runtime()
    init_db()

    if not settings.email_enabled:
        logger.warning("EMAIL_ENABLED=false: las alertas se verán en la app pero no se enviarán por correo.")

    if args.once:
        run_round()
        return

    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: stop_event.set())

    logger.info(
        "Worker en marcha: cada producto se comprueba cada %s min; reviso cada %s s.",
        settings.check_interval_minutes,
        settings.worker_poll_seconds,
    )
    while not stop_event.is_set():
        try:
            run_round()
        except Exception:  # noqa: BLE001 - el worker no debe morir por una ronda fallida
            logger.exception("Error en la ronda del worker; se reintenta en la siguiente.")
        stop_event.wait(settings.worker_poll_seconds)
    logger.info("Worker detenido.")


if __name__ == "__main__":
    main()
