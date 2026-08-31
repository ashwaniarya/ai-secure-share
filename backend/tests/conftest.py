"""Shared pytest fixtures: an isolated in-memory DB and a wired TestClient."""

import os

# Point the app's own engine at an ephemeral in-memory DB before it is imported,
# so app startup never touches a real file. Per-test data uses the StaticPool
# engine created in ``db_session`` below.
os.environ.setdefault("DATABASE_URL", "sqlite://")
# Keep the rate limiter off for the general suite; the rate-limit tests enable it
# explicitly on the shared limiter instance.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app, create_app


@pytest.fixture()
def db_session() -> Session:
    """A fresh in-memory SQLite database per test, torn down afterwards."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False
    )
    session = testing_session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    """TestClient with the DB dependency overridden to the test session."""

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def static_root(tmp_path) -> Path:
    """A built-frontend layout with a sensitive file sitting outside it."""
    static_dir = tmp_path / "static"
    (static_dir / "assets").mkdir(parents=True)
    (static_dir / "index.html").write_text(
        "<!doctype html><html><head><!--OG:START--><!--OG:END--></head>"
        "<body><div id='root'></div></body></html>",
        encoding="utf-8",
    )
    (static_dir / "assets" / "index-abc123.js").write_text(
        "console.log('app')", encoding="utf-8"
    )
    (tmp_path / "secret.txt").write_text("SUPER-SECRET", encoding="utf-8")
    return tmp_path


@pytest.fixture()
def spa_client(static_root: Path, monkeypatch, db_session: Session) -> TestClient:
    """TestClient for an app that is actually serving a built frontend.

    The static mount is skipped when no build is present, so without this the
    catch-all is never exercised by the suite.
    """
    monkeypatch.setattr(settings, "static_dir", str(static_root / "static"))
    app_with_frontend = create_app()

    def override_get_db():
        yield db_session

    app_with_frontend.dependency_overrides[get_db] = override_get_db
    with TestClient(app_with_frontend) as test_client:
        yield test_client
