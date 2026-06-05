"""Shared pytest fixtures: an isolated in-memory DB and a wired TestClient."""

import os

# Point the app's own engine at an ephemeral in-memory DB before it is imported,
# so app startup never touches a real file. Per-test data uses the StaticPool
# engine created in ``db_session`` below.
os.environ.setdefault("DATABASE_URL", "sqlite://")
# Keep the rate limiter off for the general suite; the rate-limit tests enable it
# explicitly on the shared limiter instance.
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


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
