"""Unit tests for settings normalization (see app/config.py)."""

from app.config import Settings, normalize_public_base_url


def test_scheme_less_base_url_gets_https():
    # the doubling bug: a scheme-less base ends up in an <a href> and browsers
    # resolve it relative to the page, producing a doubled host.
    assert normalize_public_base_url("airesponseshare.com") == "https://airesponseshare.com"


def test_trailing_slash_is_stripped():
    assert (
        normalize_public_base_url("https://airesponseshare.com/")
        == "https://airesponseshare.com"
    )


def test_absolute_urls_pass_through():
    assert (
        normalize_public_base_url("https://airesponseshare.com")
        == "https://airesponseshare.com"
    )
    assert (
        normalize_public_base_url("http://localhost:8000")
        == "http://localhost:8000"
    )


def test_settings_validator_normalizes_public_base_url():
    assert (
        Settings(public_base_url="airesponseshare.com").public_base_url
        == "https://airesponseshare.com"
    )
