"""Database operations for shares.

These functions own all persistence logic and secret handling so the HTTP layer
stays thin. ``create_share`` returns the raw manage token exactly once — it is
never recoverable afterward.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import security
from app.models import Share, now_utc

# Sentinel distinguishing "argument not provided" from "set this field to None".
_UNSET = object()
_MAX_SLUG_ATTEMPTS = 10


def _unique_slug(db: Session) -> str:
    for _ in range(_MAX_SLUG_ATTEMPTS):
        slug = security.generate_slug()
        if get_share(db, slug) is None:
            return slug
    raise RuntimeError("could not generate a unique slug")


def _expires_at_from(seconds: int | None):
    return now_utc() + timedelta(seconds=seconds) if seconds else None


def create_share(
    db: Session,
    *,
    content: str,
    password: str | None = None,
    expires_in_seconds: int | None = None,
) -> tuple[Share, str]:
    """Create and persist a share. Returns ``(share, raw_manage_token)``."""
    manage_token = security.generate_manage_token()
    share = Share(
        slug=_unique_slug(db),
        content=content,
        manage_token_hash=security.hash_secret(manage_token),
        password_hash=security.hash_secret(password) if password else None,
        expires_at=_expires_at_from(expires_in_seconds),
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share, manage_token


def get_share(db: Session, slug: str) -> Share | None:
    return db.scalar(select(Share).where(Share.slug == slug))


def update_share(
    db: Session,
    share: Share,
    *,
    content=_UNSET,
    password=_UNSET,
    expires_in_seconds=_UNSET,
) -> Share:
    """Patch the provided fields only; omitted fields are left untouched."""
    if content is not _UNSET:
        share.content = content
    if password is not _UNSET:
        share.password_hash = security.hash_secret(password) if password else None
    if expires_in_seconds is not _UNSET:
        share.expires_at = _expires_at_from(expires_in_seconds)
    db.commit()
    db.refresh(share)
    return share


def delete_share(db: Session, share: Share) -> None:
    db.delete(share)
    db.commit()


def is_expired(share: Share) -> bool:
    return share.expires_at is not None and now_utc() > share.expires_at


def verify_manage_token(share: Share, token: str) -> bool:
    return security.verify_secret(token, share.manage_token_hash)


def verify_password(share: Share, password: str) -> bool:
    return share.password_hash is not None and security.verify_secret(
        password, share.password_hash
    )
