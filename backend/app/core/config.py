"""Configuración de la aplicación.

Única fuente de verdad: los valores por defecto viven aquí y se sobrescriben con
variables de entorno (o el fichero `.env`). `docker-compose.yml` no repite
ninguno; solo carga `.env`.
"""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_SECRET_LENGTH = 32
INSECURE_DEFAULT_DB_PASSWORD = "dev-only-password"


class ConfigError(RuntimeError):
    pass


class Settings(BaseSettings):
    app_name: str = "Lowmark"
    # dev | prod. Fuera de `dev` se exigen secretos reales y se desactivan las ayudas de depuración.
    app_env: str = "dev"
    # URL pública desde la que se abre la app; se usa en los enlaces de los emails.
    public_base_url: str = "http://localhost:8001"
    log_level: str = "INFO"

    database_url: str = f"postgresql+psycopg2://tracker:{INSECURE_DEFAULT_DB_PASSWORD}@db:5432/tracker"

    # --- Sesiones ---
    # Obligatorio SIEMPRE (también en dev), mínimo 32 caracteres. Sin valor por defecto:
    # un secreto vacío o de ejemplo permite fabricar sesiones de cualquier usuario.
    auth_jwt_secret: str = ""
    auth_access_token_ttl_minutes: int = 15
    auth_refresh_token_ttl_days: int = 30
    auth_email_token_ttl_hours: int = 24
    auth_password_reset_ttl_minutes: int = 30
    # Solo se respeta con APP_ENV=dev y EMAIL_ENABLED=false: devuelve los tokens de
    # verificación y recuperación en la respuesta para poder probar sin servidor de correo.
    # Quien pueda llegar a la app puede tomar cualquier cuenta: úsalo solo en local.
    auth_enable_debug_tokens: bool = False
    auth_login_max_attempts: int = 5
    auth_login_window_minutes: int = 15
    auth_recovery_max_attempts: int = 5
    auth_recovery_window_minutes: int = 15
    # Las cookies `Secure` solo viajan por HTTPS. Actívalo si sirves la app con TLS.
    auth_cookie_secure: bool = False
    # Respetar X-Forwarded-For solo si hay un proxy inverso de confianza delante.
    trust_proxy_headers: bool = False
    security_hsts_enabled: bool = False

    # --- Correo (verificación, recuperación y alertas) ---
    email_enabled: bool = False
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_sender: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = 15

    # --- Comprobación de precios ---
    timezone: str = "Europe/Madrid"
    check_interval_minutes: int = 360
    worker_poll_seconds: int = 60
    alert_max_attempts: int = 5
    scraper_timeout_ms: int = 35000
    scraper_max_retries: int = 2
    scraper_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
    scraper_accept_language: str = "es-ES,es;q=0.9,en;q=0.8"
    scraper_proxy_server: str = ""
    scraper_proxy_username: str = ""
    scraper_proxy_password: str = ""

    # Carpeta con el frontend compilado. Vacía o inexistente = solo API.
    frontend_dist_dir: str = "/app/frontend"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def is_dev(self) -> bool:
        return self.app_env.strip().lower() == "dev"

    @property
    def debug_tokens_enabled(self) -> bool:
        return self.is_dev and self.auth_enable_debug_tokens and not self.email_enabled

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        positives = {
            "AUTH_LOGIN_MAX_ATTEMPTS": self.auth_login_max_attempts,
            "AUTH_LOGIN_WINDOW_MINUTES": self.auth_login_window_minutes,
            "AUTH_RECOVERY_MAX_ATTEMPTS": self.auth_recovery_max_attempts,
            "AUTH_RECOVERY_WINDOW_MINUTES": self.auth_recovery_window_minutes,
            "CHECK_INTERVAL_MINUTES": self.check_interval_minutes,
            "WORKER_POLL_SECONDS": self.worker_poll_seconds,
            "ALERT_MAX_ATTEMPTS": self.alert_max_attempts,
            "SMTP_PORT": self.smtp_port,
        }
        for name, value in positives.items():
            if value <= 0:
                raise ConfigError(f"{name} debe ser mayor que 0.")
        if self.smtp_use_ssl and self.smtp_use_tls:
            raise ConfigError("SMTP_USE_SSL y SMTP_USE_TLS no pueden estar activos a la vez.")
        if self.email_enabled and not self.smtp_sender.strip():
            raise ConfigError("Con EMAIL_ENABLED=true hay que definir SMTP_SENDER.")
        return self

    def assert_safe_for_runtime(self) -> None:
        """Se llama al arrancar la API y el worker."""
        if len(self.auth_jwt_secret.strip()) < MIN_SECRET_LENGTH:
            raise ConfigError(
                f"AUTH_JWT_SECRET tiene que tener al menos {MIN_SECRET_LENGTH} caracteres (también en dev). "
                'Genera uno con: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        if not self.is_dev and INSECURE_DEFAULT_DB_PASSWORD in self.database_url:
            raise ConfigError(
                f"Configuración insegura con APP_ENV={self.app_env}: cambia la contraseña de la base de datos."
            )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
