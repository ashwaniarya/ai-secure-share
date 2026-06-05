"""SQLAlchemy engine, session factory, and the FastAPI DB dependency."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import normalize_database_url, settings

_database_url = normalize_database_url(settings.database_url)
_connect_args = (
    {"check_same_thread": False} if _database_url.startswith("sqlite") else {}
)

engine = create_engine(_database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db() -> Iterator[Session]:
    """Yield a request-scoped session, closing it when the request ends."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
