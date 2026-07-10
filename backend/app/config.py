"""Application settings loaded from environment variables.

Centralizes the few knobs the service needs so the rest of the code never
reads ``os.environ`` directly.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_public_base_url(url: str) -> str:
    """Ensure the public base URL is absolute and has no trailing slash.

    Links are built as ``f"{public_base_url}/s/{slug}"``. If the base is
    scheme-less (e.g. ``airesponseshare.com`` — an easy env-var mistake), that
    value ends up in an ``<a href>`` and browsers resolve it *relative* to the
    current page, producing a doubled host
    (``https://airesponseshare.com/airesponseshare.com/s/...``). Prepend
    ``https://`` when no scheme is present so generated links are always
    absolute.
    """
    cleaned = url.strip().rstrip("/")
    if cleaned and "://" not in cleaned:
        cleaned = "https://" + cleaned
    return cleaned


def normalize_database_url(url: str) -> str:
    """Coerce a connection string into a SQLAlchemy + psycopg3 URL.

    Railway's Postgres plugin exposes ``DATABASE_URL`` as ``postgres://...``,
    which SQLAlchemy does not recognize. Rewrite the scheme to the psycopg3
    driver. SQLite and already-normalized URLs pass through untouched.
    """
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Defaults target local dev; production overrides via environment.
    database_url: str = "sqlite:///./dev.db"
    public_base_url: str = "http://localhost:8000"
    # Directory of the built frontend (Vite ``dist``); served if it exists.
    static_dir: str = "static"

    @field_validator("public_base_url")
    @classmethod
    def _ensure_absolute_public_base_url(cls, value: str) -> str:
        return normalize_public_base_url(value)

    # Rate limiting (slowapi). Limits are "<count>/<period>" strings.
    # Disabled in the test suite; enabled by default in dev/prod.
    rate_limit_enabled: bool = True
    rate_limit_default: str = "60/minute"  # most API routes, per client IP
    rate_limit_create: str = "20/minute"  # POST /api/shares — anti-spam
    rate_limit_unlock: str = "5/minute"  # POST .../unlock — password brute-force
    rate_limit_storage_uri: str = "memory://"  # swap to redis:// to share across replicas


settings = Settings()
