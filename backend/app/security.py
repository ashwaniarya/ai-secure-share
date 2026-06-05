"""Secret generation and hashing.

Public slugs identify a share in its URL; manage tokens authorize edits and
deletes. Manage tokens and view passwords are only ever persisted as salted
hashes (pbkdf2_sha256), never in plaintext.
"""

import secrets

from passlib.context import CryptContext

_SLUG_BYTES = 8
_TOKEN_BYTES = 32
_hasher = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def generate_slug() -> str:
    """Return a short, URL-safe public identifier for a share."""
    return secrets.token_urlsafe(_SLUG_BYTES)


def generate_manage_token() -> str:
    """Return a high-entropy, URL-safe secret used to authorize edit/delete."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_secret(secret: str) -> str:
    """Hash a password or manage token for storage."""
    return _hasher.hash(secret)


def verify_secret(secret: str, hashed: str) -> bool:
    """Constant-time check of a candidate secret against a stored hash."""
    return _hasher.verify(secret, hashed)
