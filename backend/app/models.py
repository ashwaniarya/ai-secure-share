"""ORM models.

All timestamps are stored as naive UTC. Keeping a single, explicit convention
(rather than mixing aware/naive values) avoids comparison bugs across SQLite
(tests) and Postgres (production), neither of which round-trips tz info the same
way.
"""

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def now_utc() -> datetime:
    """Current time as a naive UTC datetime (the project-wide convention)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Share(Base):
    """A single shared markdown document addressed by its public ``slug``."""

    __tablename__ = "shares"

    id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, primary_key=True, default=uuid.uuid4
    )
    slug: Mapped[str] = mapped_column(sa.String(32), unique=True, index=True)
    content: Mapped[str] = mapped_column(sa.Text)
    manage_token_hash: Mapped[str] = mapped_column(sa.String)
    password_hash: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime, default=now_utc, onupdate=now_utc
    )
