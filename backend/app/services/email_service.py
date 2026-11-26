"""Envío de correo: verificación de cuenta, recuperación de contraseña y alertas de precio."""

import logging
import smtplib
import ssl
from decimal import Decimal
from email.message import EmailMessage
from urllib.parse import quote

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmailError(RuntimeError):
    pass


def format_eur(value: Decimal | float) -> str:
    """1099.95 -> «1.099,95 €»."""
    amount = Decimal(str(value)).quantize(Decimal("0.01"))
    integer, _, cents = f"{amount:.2f}".partition(".")
    sign = "-" if integer.startswith("-") else ""
    digits = integer.lstrip("-")
    groups = []
    while digits:
        groups.insert(0, digits[-3:])
        digits = digits[:-3]
    return f"{sign}{'.'.join(groups) or '0'},{cents} €"


def build_action_url(path: str, token: str) -> str:
    base = settings.public_base_url.rstrip("/")
    return f"{base}{path}?token={quote(token, safe='')}"


def _single_line(value: str, limit: int = 180) -> str:
    """Las cabeceras de correo no admiten saltos de línea (un título raro rompía el envío)."""
    return " ".join(value.split())[:limit]


def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.email_enabled:
        raise EmailError("El envío de correo está desactivado (EMAIL_ENABLED=false).")

    message = EmailMessage()
    message["From"] = settings.smtp_sender
    message["To"] = to_email
    message["Subject"] = _single_line(subject)
    message.set_content(body)

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                host=settings.smtp_host, port=settings.smtp_port, timeout=settings.smtp_timeout_seconds
            ) as server:
                if settings.smtp_user.strip():
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(message)
            return
        with smtplib.SMTP(
            host=settings.smtp_host, port=settings.smtp_port, timeout=settings.smtp_timeout_seconds
        ) as server:
            if settings.smtp_use_tls:
                server.starttls(context=ssl.create_default_context())
            if settings.smtp_user.strip():
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailError(f"No se pudo enviar el correo: {exc}") from exc


def send_verification_email(to_email: str, token: str) -> bool:
    """Devuelve False si el correo está desactivado; lanza EmailError si falla el envío."""
    if not settings.email_enabled:
        return False
    url = build_action_url("/verificar", token)
    send_email(
        to_email,
        f"Verifica tu cuenta de {settings.app_name}",
        "Hola:\n\n"
        f"Para activar tu cuenta de {settings.app_name}, abre este enlace:\n{url}\n\n"
        f"Caduca en {settings.auth_email_token_ttl_hours} horas. "
        "Si no has creado esta cuenta, ignora este mensaje.\n",
    )
    return True


def send_password_reset_email(to_email: str, token: str) -> bool:
    if not settings.email_enabled:
        return False
    url = build_action_url("/restablecer", token)
    send_email(
        to_email,
        f"Restablece tu contraseña de {settings.app_name}",
        "Hola:\n\n"
        "Alguien (esperamos que tú) ha pedido cambiar la contraseña de tu cuenta.\n"
        f"Abre este enlace para elegir una nueva:\n{url}\n\n"
        f"Caduca en {settings.auth_password_reset_ttl_minutes} minutos. "
        "Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambia.\n",
    )
    return True


def send_price_alert_email(
    to_email: str,
    product_title: str,
    product_url: str,
    triggered_price: Decimal,
    desired_price: Decimal,
) -> None:
    title = _single_line(product_title, 120)
    send_email(
        to_email,
        f"Bajada de precio: {title} a {format_eur(triggered_price)}",
        "¡Buenas noticias!\n\n"
        f"{title}\n"
        f"Precio actual: {format_eur(triggered_price)}\n"
        f"Tu objetivo: {format_eur(desired_price)}\n\n"
        f"Comprar: {product_url}\n"
        f"Ver el historial: {settings.public_base_url.rstrip('/')}/\n\n"
        "Te volveremos a avisar si el precio sube por encima de tu objetivo y vuelve a bajar.\n",
    )
