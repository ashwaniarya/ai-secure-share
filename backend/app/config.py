"""Application settings loaded from environment variables.

Centralizes the few knobs the service needs so the rest of the code never
reads ``os.environ`` directly.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


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


settings = Settings()
