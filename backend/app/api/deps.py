import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME
from app.db.models import User, UserSession
from app.db.session import get_db_session
from app.services.auth_service import get_user_and_session_from_access_token

settings = get_settings()
UNSAFE_HTTP_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def get_client_ip(request: Request) -> str | None:
    # X-Forwarded-For lo puede escribir cualquiera; solo vale si hay un proxy de confianza delante.
    if settings.trust_proxy_headers:
        forwarded_for = request.headers.get("x-forwarded-for", "").strip()
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def get_user_agent(request: Request) -> str | None:
    user_agent = request.headers.get("user-agent")
    return user_agent[:512] if user_agent else None


def _extract_access_token(request: Request, authorization: str | None) -> str | None:
    cookie_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if cookie_token:
        return cookie_token
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[len("bearer ") :].strip()
    return None


def should_enforce_csrf(*, method: str, path: str, access_cookie_present: bool, csrf_enabled: bool = True) -> bool:
    if not csrf_enabled or not access_cookie_present:
        return False
    if not path.startswith("/api"):
        return False
    return method.upper() in UNSAFE_HTTP_METHODS


def is_valid_csrf_pair(cookie_token: str | None, header_token: str | None) -> bool:
    if not cookie_token or not header_token:
        return False
    cookie_value = cookie_token.strip()
    header_value = header_token.strip()
    if not cookie_value or not header_value:
        return False
    return secrets.compare_digest(cookie_value, header_value)


def require_csrf_protection(request: Request, x_csrf_token: str | None = Header(default=None)) -> None:
    enforce = should_enforce_csrf(
        method=request.method,
        path=request.url.path,
        access_cookie_present=bool(request.cookies.get(ACCESS_COOKIE_NAME)),
    )
    if enforce and not is_valid_csrf_pair(request.cookies.get(CSRF_COOKIE_NAME), x_csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token CSRF no válido. Recarga la página.")


def get_optional_auth_context(
    request: Request,
    db: Session = Depends(get_db_session),
    authorization: str | None = Header(default=None),
) -> tuple[User, UserSession] | None:
    access_token = _extract_access_token(request, authorization)
    if not access_token:
        return None
    try:
        return get_user_and_session_from_access_token(db, access_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión no válida.") from exc


def get_current_auth_context(
    auth_context: tuple[User, UserSession] | None = Depends(get_optional_auth_context),
) -> tuple[User, UserSession]:
    if not auth_context:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tienes que iniciar sesión.")
    return auth_context


def get_current_user(auth_context: tuple[User, UserSession] = Depends(get_current_auth_context)) -> User:
    return auth_context[0]


def get_current_session(auth_context: tuple[User, UserSession] = Depends(get_current_auth_context)) -> UserSession:
    return auth_context[1]


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentSession = Annotated[UserSession, Depends(get_current_session)]
DbSession = Annotated[Session, Depends(get_db_session)]
