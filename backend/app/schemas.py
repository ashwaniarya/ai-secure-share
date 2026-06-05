"""Pydantic request/response models for the shares API.

``ShareUpdate`` is intentionally all-optional: the endpoint inspects
``model_fields_set`` so an omitted field is left unchanged while an explicit
``null`` clears it (e.g. removing a password or expiry).
"""

from datetime import datetime

from pydantic import BaseModel, Field

_MAX_CONTENT = 100_000


class ShareCreate(BaseModel):
    content: str = Field(min_length=1, max_length=_MAX_CONTENT)
    password: str | None = None
    expires_in_seconds: int | None = Field(default=None, ge=1)


class ShareUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=_MAX_CONTENT)
    password: str | None = None
    expires_in_seconds: int | None = Field(default=None, ge=1)


class ShareCreateResponse(BaseModel):
    slug: str
    manage_token: str
    url: str
    expires_at: datetime | None


class ShareView(BaseModel):
    slug: str
    content: str | None
    has_password: bool
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UnlockRequest(BaseModel):
    password: str


class UnlockResponse(BaseModel):
    content: str
