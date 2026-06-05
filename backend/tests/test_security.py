import re

from app.security import (
    generate_manage_token,
    generate_slug,
    hash_secret,
    verify_secret,
)

URL_SAFE = re.compile(r"^[A-Za-z0-9_-]+$")


def test_generate_slug_is_url_safe_and_reasonably_short():
    slug = generate_slug()
    assert URL_SAFE.match(slug)
    assert 8 <= len(slug) <= 16


def test_generate_slug_is_unique_across_calls():
    slugs = {generate_slug() for _ in range(100)}
    assert len(slugs) == 100


def test_generate_manage_token_is_long_and_url_safe():
    token = generate_manage_token()
    assert URL_SAFE.match(token)
    assert len(token) >= 32


def test_hash_secret_does_not_store_plaintext():
    hashed = hash_secret("hunter2")
    assert "hunter2" not in hashed
    assert hashed != "hunter2"


def test_hash_secret_uses_random_salt():
    assert hash_secret("same") != hash_secret("same")


def test_verify_secret_accepts_correct_value():
    hashed = hash_secret("correct horse")
    assert verify_secret("correct horse", hashed) is True


def test_verify_secret_rejects_wrong_value():
    hashed = hash_secret("correct horse")
    assert verify_secret("battery staple", hashed) is False
