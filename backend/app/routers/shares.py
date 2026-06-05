"""HTTP endpoints for creating, reading, updating, and deleting shares.

The router stays thin: it validates input, resolves the share, enforces access
(manage token for writes, owner-bypass / password / expiry for reads), and
delegates all persistence to ``crud``.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session

from app import crud
from app.config import settings
from app.database import get_db
from app.models import Share
from app.schemas import (
    ShareCreate,
    ShareCreateResponse,
    ShareUpdate,
    ShareView,
    UnlockRequest,
    UnlockResponse,
)

router = APIRouter(prefix="/api/shares", tags=["shares"])

_BEARER_PREFIX = "Bearer "


def bearer_token(authorization: str | None = Header(default=None)) -> str | None:
    """Extract the manage token from an ``Authorization: Bearer <token>`` header."""
    if authorization and authorization.startswith(_BEARER_PREFIX):
        return authorization[len(_BEARER_PREFIX) :]
    return None


def _get_or_404(db: Session, slug: str) -> Share:
    share = crud.get_share(db, slug)
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")
    return share


def _require_owner(share: Share, token: str | None) -> None:
    if token is None or not crud.verify_manage_token(share, token):
        raise HTTPException(status_code=403, detail="Invalid manage token")


def _view(share: Share, *, include_content: bool) -> ShareView:
    return ShareView(
        slug=share.slug,
        content=share.content if include_content else None,
        has_password=share.password_hash is not None,
        expires_at=share.expires_at,
        created_at=share.created_at,
        updated_at=share.updated_at,
    )


@router.post("", response_model=ShareCreateResponse, status_code=201)
def create_share(payload: ShareCreate, db: Session = Depends(get_db)):
    share, manage_token = crud.create_share(
        db,
        content=payload.content,
        password=payload.password,
        expires_in_seconds=payload.expires_in_seconds,
    )
    return ShareCreateResponse(
        slug=share.slug,
        manage_token=manage_token,
        url=f"{settings.public_base_url}/s/{share.slug}",
        expires_at=share.expires_at,
    )


@router.get("/{slug}", response_model=ShareView)
def read_share(
    slug: str,
    db: Session = Depends(get_db),
    token: str | None = Depends(bearer_token),
):
    share = _get_or_404(db, slug)
    if token is not None and crud.verify_manage_token(share, token):
        return _view(share, include_content=True)
    if crud.is_expired(share):
        raise HTTPException(status_code=410, detail="This share has expired")
    return _view(share, include_content=share.password_hash is None)


@router.post("/{slug}/unlock", response_model=UnlockResponse)
def unlock_share(slug: str, payload: UnlockRequest, db: Session = Depends(get_db)):
    share = _get_or_404(db, slug)
    if crud.is_expired(share):
        raise HTTPException(status_code=410, detail="This share has expired")
    if not crud.verify_password(share, payload.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    return UnlockResponse(content=share.content)


@router.put("/{slug}", response_model=ShareView)
def update_share(
    slug: str,
    payload: ShareUpdate,
    db: Session = Depends(get_db),
    token: str | None = Depends(bearer_token),
):
    share = _get_or_404(db, slug)
    _require_owner(share, token)

    fields = payload.model_fields_set
    changes: dict = {}
    if "content" in fields and payload.content is not None:
        changes["content"] = payload.content
    if "password" in fields:
        changes["password"] = payload.password
    if "expires_in_seconds" in fields:
        changes["expires_in_seconds"] = payload.expires_in_seconds

    crud.update_share(db, share, **changes)
    return _view(share, include_content=True)


@router.delete("/{slug}", status_code=204)
def delete_share(
    slug: str,
    db: Session = Depends(get_db),
    token: str | None = Depends(bearer_token),
):
    share = _get_or_404(db, slug)
    _require_owner(share, token)
    crud.delete_share(db, share)
    return Response(status_code=204)
