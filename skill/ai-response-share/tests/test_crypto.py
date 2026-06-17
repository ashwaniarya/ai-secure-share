"""Tests for the shared envelope crypto core (Python side).

Covers round-trip correctness, envelope detection, base64url padding edge
cases, URL-fragment key extraction, and a cross-language INTEROP check that
decrypts the canonical vector shared with the TypeScript suite.
"""

import json
from pathlib import Path

import pytest

import crypto

VECTOR_PATH = Path(__file__).resolve().parent / "interop_vector.json"


@pytest.fixture(scope="module")
def interop_vector() -> dict:
    """Load the canonical cross-language interop vector."""
    return json.loads(VECTOR_PATH.read_text(encoding="utf-8"))


# --- round-trip ------------------------------------------------------------


def test_round_trip_ascii():
    key = crypto.generate_key()
    plaintext = "hello world"
    assert crypto.decrypt(crypto.encrypt(plaintext, key), key) == plaintext


def test_round_trip_multibyte():
    key = crypto.generate_key()
    plaintext = "# Heading\nUnicode: 🔐 café — 日本語"
    assert crypto.decrypt(crypto.encrypt(plaintext, key), key) == plaintext


def test_round_trip_empty_string():
    key = crypto.generate_key()
    assert crypto.decrypt(crypto.encrypt("", key), key) == ""


def test_encrypt_uses_fresh_iv_each_call():
    key = crypto.generate_key()
    first = crypto.encrypt("same input", key)
    second = crypto.encrypt("same input", key)
    # Fresh random IV per call -> different envelopes for identical plaintext.
    assert first != second


def test_generate_key_length_and_uniqueness():
    assert len(crypto.generate_key()) == 32
    assert crypto.generate_key() != crypto.generate_key()


# --- is_encrypted ----------------------------------------------------------


def test_is_encrypted_true_for_envelope():
    key = crypto.generate_key()
    assert crypto.is_encrypted(crypto.encrypt("secret", key)) is True


def test_is_encrypted_true_for_bare_prefix():
    assert crypto.is_encrypted("arsenc.1.aa.bb") is True


@pytest.mark.parametrize(
    "content",
    [
        "plain text",
        "# Markdown heading",
        "",
        "arsen",  # prefix is incomplete
        " arsenc.1.x.y",  # leading space breaks the marker
    ],
)
def test_is_encrypted_false_for_plaintext(content):
    assert crypto.is_encrypted(content) is False


# --- b64url padding edge cases ---------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        b"",  # empty
        b"f",  # 1 byte  -> 2 b64 chars, 2 pad
        b"fo",  # 2 bytes -> 3 b64 chars, 1 pad
        b"foo",  # 3 bytes -> 4 b64 chars, 0 pad
        b"foob",  # 4 bytes -> cycles padding again
        bytes(range(256)),  # exercises 62/63 chars ('-' and '_')
    ],
)
def test_b64url_round_trip(raw):
    encoded = crypto.b64url_encode(raw)
    assert "=" not in encoded  # never padded
    assert crypto.b64url_decode(encoded) == raw


def test_b64url_uses_url_safe_alphabet():
    # Bytes 0xFB, 0xFF map to '+'/'/' in standard b64 -> must be '-'/'_' here.
    encoded = crypto.b64url_encode(bytes([0xFB, 0xFF, 0xFE]))
    assert "+" not in encoded and "/" not in encoded


def test_key_b64url_round_trip():
    key = crypto.generate_key()
    assert crypto.b64url_to_key(crypto.key_to_b64url(key)) == key


# --- extract_key_from_url --------------------------------------------------


def test_extract_key_full_url_with_fragment():
    key_b64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    url = f"https://share.example.com/s/abc123#k={key_b64}"
    assert crypto.extract_key_from_url(url) == key_b64


def test_extract_key_bare_fragment_with_hash():
    key_b64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    assert crypto.extract_key_from_url(f"#k={key_b64}") == key_b64


def test_extract_key_bare_fragment_no_hash():
    key_b64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    assert crypto.extract_key_from_url(f"k={key_b64}") == key_b64


def test_extract_key_url_no_fragment_returns_none():
    assert crypto.extract_key_from_url("https://share.example.com/s/abc123") is None


def test_extract_key_fragment_other_params_returns_none():
    url = "https://share.example.com/s/abc123#tab=raw&theme=dark"
    assert crypto.extract_key_from_url(url) is None


def test_extract_key_among_other_fragment_params():
    key_b64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    url = f"https://share.example.com/s/abc123#tab=raw&k={key_b64}&theme=dark"
    assert crypto.extract_key_from_url(url) == key_b64


# --- malformed envelope errors ---------------------------------------------


def test_decrypt_rejects_plaintext():
    with pytest.raises(ValueError):
        crypto.decrypt("not an envelope", crypto.generate_key())


def test_decrypt_rejects_wrong_field_count():
    with pytest.raises(ValueError):
        crypto.decrypt("arsenc.1.onlyiv", crypto.generate_key())


def test_decrypt_rejects_unsupported_version():
    with pytest.raises(ValueError):
        crypto.decrypt("arsenc.2.ZGVm.YWJj", crypto.generate_key())


# --- INTEROP (cross-language) ----------------------------------------------


def test_interop_decrypts_canonical_vector(interop_vector):
    """The Python side decrypts the shared vector produced for both suites."""
    key = crypto.b64url_to_key(interop_vector["key_b64url"])
    decrypted = crypto.decrypt(interop_vector["envelope"], key)
    assert decrypted == interop_vector["plaintext"]


def test_interop_vector_is_detected_as_encrypted(interop_vector):
    assert crypto.is_encrypted(interop_vector["envelope"]) is True
