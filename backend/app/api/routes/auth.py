import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentSession, CurrentUser, get_client_ip, get_user_agent
from app.core.config import get_settings
from app.core.security import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    cookie_max_age_seconds,
    generate_csrf_token,
    refresh_token_expiration,
)
from app.db.session import get_db_session
from app.schemas.auth import (
    AuthMessageResponse,
    AuthUserResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    RevokeOtherSessionsResponse,
    UserSessionListResponse,
    UserSessionResponse,
    VerifyEmailRequest,
)
from app.services.auth_service import (
    AccountExistsError,
    EmailNotVerifiedError,
    change_password,
    list_user_sessions,
    login_user,
    logout_session,
    refresh_session,
    register_user,
    request_password_reset,
    resend_email_verification,
    reset_password_with_token,
    revoke_other_user_sessions,
    verify_email,
)
from app.services.auth_throttle import (
    build_email_action_throttle_key,
    build_login_throttle_key,
    check_login_rate_limit,
    check_recovery_rate_limit,
    clear_login_failures,
    register_login_failure,
    register_recovery_attempt,
)
from app.services.email_service import EmailError, send_password_reset_email, send_verification_email

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/auth")


COOKIE_SAMESITE = "lax"


def _set_cookie(response: Response, key: str, value: str, expires_at, httponly: bool = True) -> None:
    response.set_cookie(
        key=key,
        value=value,
        httponly=httponly,
        secure=settings.auth_cookie_secure,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=cookie_max_age_seconds(expires_at),
    )


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str, access_exp, refresh_exp) -> None:
    _set_cookie(response, ACCESS_COOKIE_NAME, access_token, access_exp)
    _set_cookie(response, REFRESH_COOKIE_NAME, refresh_token, refresh_exp)


def _set_csrf_cookie(response: Response, csrf_token: str, refresh_expiration) -> None:
    # Legible desde JS a propósito: el frontend la copia en la cabecera X-CSRF-Token.
    _set_cookie(response, CSRF_COOKIE_NAME, csrf_token, refresh_expiration, httponly=False)


def _clear_auth_cookies(response: Response) -> None:
    for key in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, CSRF_COOKIE_NAME):
        response.delete_cookie(key=key, path="/")


def _debug(token: str | None) -> str | None:
    return token if (token and settings.debug_tokens_enabled) else None


def _enforce_rate_limit(db: Session, throttle_key: str, message: str) -> None:
    """Cuenta un intento y corta con 429 si se pasa del límite de la ventana."""
    try:
        decision = check_recovery_rate_limit(db, throttle_key)
        if decision.allowed:
            # Se cuenta este intento; el que llega al tope aún pasa y se corta el siguiente.
            register_recovery_attempt(db, throttle_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    if not decision.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=message,
            headers={"Retry-After": str(decision.retry_after_seconds)},
        )


def _send_later(background: BackgroundTasks, sender, email: str, token: str) -> None:
    """Envía el correo después de responder: el tiempo de respuesta no delata si la cuenta existe."""

    def task() -> None:
        try:
            sender(email, token)
        except EmailError:
            logger.exception("No se pudo enviar un correo de cuenta")

    background.add_task(task)


REGISTER_MESSAGE_EMAIL = "Si el email es válido, te hemos enviado un enlace para activar la cuenta."
REGISTER_MESSAGE_DEV = "Cuenta creada. Sin correo configurado: usa el token de desarrollo para verificarla."


@router.post("/register", response_model=AuthMessageResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db_session),
) -> AuthMessageResponse:
    client_ip = get_client_ip(request)
    _enforce_rate_limit(
        db,
        build_email_action_throttle_key(client_ip, "-", "register"),
        "Demasiados registros desde esta conexión. Inténtalo más tarde.",
    )
    message = REGISTER_MESSAGE_EMAIL if settings.email_enabled else REGISTER_MESSAGE_DEV
    try:
        user, raw_verification_token = register_user(
            db,
            email=payload.email,
            password=payload.password,
            ip_address=client_ip,
            user_agent=get_user_agent(request),
        )
    except AccountExistsError:
        # Respuesta idéntica a la de una cuenta nueva: no se revela qué emails están registrados.
        return AuthMessageResponse(message=message)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    if settings.email_enabled:
        _send_later(background, send_verification_email, user.email, raw_verification_token)
    return AuthMessageResponse(message=message, debug_token=_debug(raw_verification_token))


@router.post("/resend-verification", response_model=AuthMessageResponse)
def resend_verification(
    payload: ResendVerificationRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db_session),
) -> AuthMessageResponse:
    client_ip = get_client_ip(request)
    _enforce_rate_limit(
        db,
        build_email_action_throttle_key(client_ip, payload.email, "resend_verification"),
        "Demasiadas solicitudes de verificación. Inténtalo más tarde.",
    )
    try:
        raw_token = resend_email_verification(
            db,
            email=payload.email,
            ip_address=client_ip,
            user_agent=get_user_agent(request),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    if raw_token and settings.email_enabled:
        _send_later(background, send_verification_email, payload.email, raw_token)
    return AuthMessageResponse(
        message="Si la cuenta existe y no está verificada, te hemos enviado un enlace nuevo.",
        debug_token=_debug(raw_token),
    )


@router.post("/verify-email", response_model=AuthMessageResponse)
def verify_email_token(
    payload: VerifyEmailRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> AuthMessageResponse:
    try:
        verify_email(
            db,
            raw_token=payload.token,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return AuthMessageResponse(message="Email verificado correctamente.")


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
) -> LoginResponse:
    client_ip = get_client_ip(request)
    throttle_key = build_login_throttle_key(client_ip, payload.email)
    try:
        throttle = check_login_rate_limit(db, throttle_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    if not throttle.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
            headers={"Retry-After": str(throttle.retry_after_seconds)},
        )

    try:
        user, tokens = login_user(
            db,
            email=payload.email,
            password=payload.password,
            ip_address=client_ip,
            user_agent=get_user_agent(request),
        )
    except EmailNotVerifiedError as exc:
        # La contraseña es correcta: no cuenta como intento fallido.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError:
        try:
            updated_throttle = register_login_failure(db, throttle_key)
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

        if not updated_throttle.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
                headers={"Retry-After": str(updated_throttle.retry_after_seconds)},
            ) from None
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Email o contraseña incorrectos."
        ) from None
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    try:
        clear_login_failures(db, throttle_key)
    except RuntimeError:
        # Si falla la limpieza del contador, no impedimos el login correcto.
        pass
    _set_auth_cookies(
        response=response,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        access_exp=tokens.access_expires_at,
        refresh_exp=tokens.refresh_expires_at,
    )
    _set_csrf_cookie(response, generate_csrf_token(), tokens.refresh_expires_at)
    return LoginResponse(user=AuthUserResponse.model_validate(user))


@router.post("/refresh", response_model=LoginResponse)
def refresh_login(
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
) -> LoginResponse:
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No hay sesión que renovar.",
        )

    try:
        user, tokens = refresh_session(
            db,
            raw_refresh_token=raw_refresh,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
    except ValueError as exc:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    _set_auth_cookies(
        response=response,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        access_exp=tokens.access_expires_at,
        refresh_exp=tokens.refresh_expires_at,
    )
    _set_csrf_cookie(response, generate_csrf_token(), tokens.refresh_expires_at)
    return LoginResponse(user=AuthUserResponse.model_validate(user))


@router.post("/logout", response_model=AuthMessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
) -> AuthMessageResponse:
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    try:
        logout_session(
            db,
            raw_refresh_token=raw_refresh,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    _clear_auth_cookies(response)
    return AuthMessageResponse(message="Sesión cerrada.")


@router.get("/sessions", response_model=UserSessionListResponse)
def get_my_sessions(
    user: CurrentUser,
    current_session: CurrentSession,
    db: Session = Depends(get_db_session),
) -> UserSessionListResponse:
    try:
        active_sessions = list_user_sessions(db, user_id=user.id, include_revoked=False)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return UserSessionListResponse(
        sessions=[
            UserSessionResponse(
                id=user_session.id,
                ip_address=user_session.ip_address,
                user_agent=user_session.user_agent,
                expires_at=user_session.expires_at,
                revoked_at=user_session.revoked_at,
                created_at=user_session.created_at,
                is_current=user_session.id == current_session.id,
            )
            for user_session in active_sessions
        ]
    )


@router.post("/sessions/revoke-others", response_model=RevokeOtherSessionsResponse)
def revoke_other_sessions(
    request: Request,
    user: CurrentUser,
    current_session: CurrentSession,
    db: Session = Depends(get_db_session),
) -> RevokeOtherSessionsResponse:
    try:
        revoked_count = revoke_other_user_sessions(
            db,
            user_id=user.id,
            current_session_id=current_session.id,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return RevokeOtherSessionsResponse(
        message="Sesiones remotas cerradas correctamente.",
        revoked_count=revoked_count,
    )


@router.get("/me", response_model=AuthUserResponse)
def get_me(
    request: Request,
    response: Response,
    user: CurrentUser,
) -> AuthUserResponse:
    if not request.cookies.get(CSRF_COOKIE_NAME):
        _set_csrf_cookie(response, generate_csrf_token(), refresh_token_expiration())
    return AuthUserResponse.model_validate(user)


@router.post("/change-password", response_model=AuthMessageResponse)
def change_my_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: CurrentUser,
    current_session: CurrentSession,
    db: Session = Depends(get_db_session),
) -> AuthMessageResponse:
    try:
        change_password(
            db,
            user=user,
            current_password=payload.current_password,
            new_password=payload.new_password,
            current_session_id=current_session.id,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return AuthMessageResponse(message="Contraseña actualizada.")


@router.post("/forgot-password", response_model=AuthMessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db_session),
) -> AuthMessageResponse:
    client_ip = get_client_ip(request)
    _enforce_rate_limit(
        db,
        build_email_action_throttle_key(client_ip, payload.email, "forgot_password"),
        "Demasiadas solicitudes de recuperación. Inténtalo más tarde.",
    )
    try:
        raw_token = request_password_reset(
            db,
            email=payload.email,
            ip_address=client_ip,
            user_agent=get_user_agent(request),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    if raw_token and settings.email_enabled:
        _send_later(background, send_password_reset_email, payload.email, raw_token)
    # Mensaje uniforme para no revelar qué emails tienen cuenta.
    return AuthMessageResponse(
        message="Si hay una cuenta con ese email, te hemos enviado un enlace para cambiar la contraseña.",
        debug_token=_debug(raw_token),
    )


@router.post("/reset-password", response_model=AuthMessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db_session),
) -> AuthMessageResponse:
    try:
        reset_password_with_token(
            db,
            raw_token=payload.token,
            new_password=payload.new_password,
            ip_address=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return AuthMessageResponse(message="Contraseña cambiada. Ya puedes entrar con la nueva.")
