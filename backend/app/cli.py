"""Tareas de administración desde la línea de comandos.

    docker compose exec web python -m app.cli crear-admin tu@email.com
    docker compose exec web python -m app.cli quitar-admin tu@email.com

`crear-admin` crea la cuenta (verificada) o asciende una que ya exista y le pone
contraseña. Si no se pasa --password, genera una aleatoria y la muestra UNA vez.
"""

import argparse
import secrets
import sys
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, normalize_email
from app.db.models import User, UserSession

MIN_PASSWORD_LENGTH = 12


def create_admin(session: Session, email: str, password: str | None) -> tuple[User, str | None, bool]:
    """Devuelve (usuario, contraseña generada o None, si se ha creado)."""
    generated = None
    if password is None:
        generated = password = secrets.token_urlsafe(18)
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")

    normalized = normalize_email(email)
    user = session.scalar(select(User).where(User.email == normalized))
    created = user is None
    if created:
        user = User(email=normalized)
        session.add(user)
    else:
        # Contraseña nueva: se cierran las sesiones que hubiera abiertas con la anterior.
        for open_session in session.scalars(
            select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        ):
            open_session.revoked_at = datetime.now(timezone.utc)
    user.password_hash = hash_password(password)
    user.is_email_verified = True
    user.is_active = True
    user.is_admin = True
    session.commit()
    session.refresh(user)
    return user, generated, created


def remove_admin(session: Session, email: str) -> bool:
    user = session.scalar(select(User).where(User.email == normalize_email(email)))
    if not user:
        return False
    user.is_admin = False
    session.commit()
    return True


def main(argv: list[str] | None = None) -> int:
    from app.db.session import SessionLocal

    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("crear-admin", help="crea o asciende una cuenta de administrador")
    create.add_argument("email")
    create.add_argument("--password", help="si no se indica, se genera una aleatoria")
    remove = commands.add_parser("quitar-admin", help="quita el rol de administrador")
    remove.add_argument("email")
    args = parser.parse_args(argv)

    with SessionLocal() as session:
        if args.command == "crear-admin":
            try:
                user, generated, created = create_admin(session, args.email, args.password)
            except ValueError as exc:
                print(exc, file=sys.stderr)
                return 1
            action = "Creada" if created else "Actualizada"
            print(f"{action} la cuenta de administrador {user.email} (id {user.id}).")
            if generated:
                print(f"Contraseña: {generated}")
                print("Guárdala ahora: no se vuelve a mostrar. Puedes cambiarla en Ajustes.")
            return 0

        if not remove_admin(session, args.email):
            print("No existe esa cuenta.", file=sys.stderr)
            return 1
        print("Rol de administrador retirado.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
