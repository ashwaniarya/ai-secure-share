"""Settings normalization — keeps share links absolute and well-formed.

A scheme-less ``public_base_url`` (e.g. ``airesponseshare.com``) flows into every
share URL the API returns. Browsers then treat the link as relative and resolve
it against the current page, producing the duplicated-domain bug
(``host/host/s/slug``). These tests pin the normalization that prevents it.
"""

from app.config import Settings, normalize_public_base_url


def test_adds_https_when_scheme_missing():
    assert normalize_public_base_url("airesponseshare.com") == "https://airesponseshare.com"


def test_preserves_https_scheme():
    assert (
        normalize_public_base_url("https://airesponseshare.com")
        == "https://airesponseshare.com"
    )


def test_preserves_http_localhost():
    assert normalize_public_base_url("http://localhost:8000") == "http://localhost:8000"


def test_strips_trailing_slash():
    assert (
        normalize_public_base_url("https://airesponseshare.com/")
        == "https://airesponseshare.com"
    )


def test_upgrades_protocol_relative():
    assert normalize_public_base_url("//airesponseshare.com") == "https://airesponseshare.com"


def test_settings_normalizes_public_base_url():
    """The actual Settings field must apply the normalization."""
    assert (
        Settings(public_base_url="airesponseshare.com").public_base_url
        == "https://airesponseshare.com"
    )
