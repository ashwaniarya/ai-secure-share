"""Zero-knowledge envelope cryptography for shared AI responses (CLI side).

This module is the Python half of a shared crypto core. Its TypeScript twin
(``frontend/src/lib/crypto.ts``) MUST produce and consume the EXACT same
envelope format, so each side can read what the other wrote.

Envelope format (version 1)::

    arsenc.1.<b64url(iv)>.<b64url(ciphertext_with_tag)>

- Cipher: AES-256-GCM (AEAD). Key is 32 random bytes; iv/nonce is 12 random
  bytes, fresh per encryption. No associated data (AAD).
- AES-GCM already appends the 16-byte auth tag to the ciphertext, so we store
  ``ciphertext_with_tag`` as-is and hand the whole blob back to decrypt.
- ``b64url`` is base64url WITHOUT ``=`` padding. Decoders re-add padding.
- Plaintext is UTF-8. The ``arsenc.`` prefix is the detection marker; ``1`` is
  the format version.

Import policy: this module is import-safe with the stdlib alone. The optional
``cryptography`` package is imported LAZILY inside :func:`encrypt`/:func:`decrypt`
so unrelated CLI paths keep working when it is not installed.
"""

# PEP 563: defer annotation evaluation so ``str | None`` parses on Python 3.9,
# where the X | Y union syntax is not yet valid at runtime in annotations.
from __future__ import annotations

import base64
import os
import re

# Envelope wire constants. Kept in lockstep with crypto.ts.
ENVELOPE_PREFIX = "arsenc."
ENVELOPE_VERSION = "1"
KEY_LENGTH_BYTES = 32
IV_LENGTH_BYTES = 12

_INSTALL_HINT = (
    "The 'cryptography' package is required for encryption. "
    "Install it with: pip install cryptography"
)


def b64url_encode(b: bytes) -> str:
    """Encode bytes as base64url WITHOUT padding.

    The trailing ``=`` characters are stripped to keep envelopes and URL
    fragments compact and URL-safe.
    """
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def b64url_decode(s: str) -> bytes:
    """Decode an unpadded base64url string back to bytes.

    Re-adds the ``=`` padding that :func:`b64url_encode` stripped before
    decoding, so it round-trips regardless of input length.
    """
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def generate_key() -> bytes:
    """Return a fresh 32-byte AES-256 key from the OS CSPRNG."""
    return os.urandom(KEY_LENGTH_BYTES)


def key_to_b64url(key: bytes) -> str:
    """Render a raw key as an unpadded base64url string (e.g. for URLs)."""
    return b64url_encode(key)


def b64url_to_key(s: str) -> bytes:
    """Parse an unpadded base64url string back into raw key bytes."""
    return b64url_decode(s)


def is_encrypted(content: str) -> bool:
    """Report whether a share-content string is an encrypted envelope.

    Detection is purely the ``arsenc.`` prefix; anything else is treated as
    plaintext (legacy/public) content.
    """
    return content.startswith(ENVELOPE_PREFIX)


def encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt UTF-8 ``plaintext`` under ``key`` into a version-1 envelope.

    Generates a fresh random 12-byte IV per call. Lazily imports ``AESGCM``.

    Side effects: reads OS randomness for the IV.

    Raises:
        RuntimeError: if the optional ``cryptography`` package is missing.
    """
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:  # pragma: no cover - exercised only without dep
        raise RuntimeError(_INSTALL_HINT) from exc

    iv = os.urandom(IV_LENGTH_BYTES)
    # AESGCM.encrypt appends the 16-byte tag to the ciphertext automatically.
    ciphertext_with_tag = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)
    return ".".join(
        [
            ENVELOPE_PREFIX + ENVELOPE_VERSION,
            b64url_encode(iv),
            b64url_encode(ciphertext_with_tag),
        ]
    )


def decrypt(envelope: str, key: bytes) -> str:
    """Decrypt a version-1 envelope produced by :func:`encrypt` (or its TS twin).

    Validates the prefix/version and structure, lazily imports ``AESGCM``, and
    returns the UTF-8 plaintext.

    Raises:
        ValueError: if the envelope is malformed (bad prefix, wrong version,
            wrong field count, or invalid base64url).
        RuntimeError: if the optional ``cryptography`` package is missing.
    """
    if not is_encrypted(envelope):
        raise ValueError("Not an encrypted envelope: missing 'arsenc.' prefix")

    # Split into exactly: header ("arsenc.1"), iv, ciphertext+tag.
    parts = envelope.split(".")
    if len(parts) != 4:
        raise ValueError("Malformed envelope: expected 'arsenc.<ver>.<iv>.<ct>'")

    _prefix, version, iv_b64, ciphertext_b64 = parts
    if version != ENVELOPE_VERSION:
        raise ValueError(f"Unsupported envelope version: {version!r}")

    try:
        iv = b64url_decode(iv_b64)
        ciphertext_with_tag = b64url_decode(ciphertext_b64)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Malformed envelope: invalid base64url") from exc

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:  # pragma: no cover - exercised only without dep
        raise RuntimeError(_INSTALL_HINT) from exc

    plaintext_bytes = AESGCM(key).decrypt(iv, ciphertext_with_tag, None)
    return plaintext_bytes.decode("utf-8")


def extract_key_from_url(value: str) -> str | None:
    """Pull the base64url key out of a URL fragment, if present.

    Accepts a full URL (``https://host/s/abc#k=<b64url>``) or a bare fragment
    (``#k=<b64url>`` or ``k=<b64url>``). The fragment may carry other params
    separated by ``&``; only ``k`` is returned.

    Returns:
        The base64url key string, or ``None`` if no ``k`` param is found.
    """
    # Isolate the fragment: everything after the first '#', or the whole value
    # if it already looks like a fragment body.
    if "#" in value:
        fragment = value.split("#", 1)[1]
    elif value.startswith("k=") or "=" in value.split("&", 1)[0]:
        fragment = value
    else:
        return None

    for param in fragment.split("&"):
        match = re.match(r"^k=(.+)$", param)
        if match:
            return match.group(1)
    return None
