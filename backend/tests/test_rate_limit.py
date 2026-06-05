"""Rate limiting (slowapi): one central per-IP limiter on the API.

Behaviour covered:
- ``client_ip`` keys on the real caller (X-Forwarded-For first hop) behind a proxy.
- ``create`` and ``unlock`` have their own tighter limits (spam / brute-force).
- The central default limit applies to other API routes, per client IP.
- ``/api/health`` is exempt.

The app under test is a module-level singleton with the limiter disabled by
default (see ``conftest``); the ``enabled_limiter`` fixture turns it on and
resets storage so cases don't bleed into each other. Each case also uses a
distinct ``X-Forwarded-For`` IP for bucket isolation.
"""

import pytest

from app.config import settings
from app.ratelimit import client_ip, limiter


# ---- client_ip (unit) -------------------------------------------------------

class _FakeRequest:
    def __init__(self, headers=None, host="9.9.9.9"):
        self.headers = headers or {}
        self.client = type("Client", (), {"host": host})()


def test_client_ip_prefers_first_forwarded_hop():
    req = _FakeRequest(headers={"x-forwarded-for": "1.2.3.4, 10.0.0.1"})
    assert client_ip(req) == "1.2.3.4"


def test_client_ip_falls_back_to_peer_address():
    assert client_ip(_FakeRequest(headers={})) == "9.9.9.9"


# ---- integration ------------------------------------------------------------

@pytest.fixture()
def enabled_limiter():
    limiter.reset()
    limiter.enabled = True
    try:
        yield
    finally:
        limiter.enabled = False
        limiter.reset()


def _ip(n: int) -> dict:
    return {"X-Forwarded-For": f"203.0.113.{n}"}


def _has(headers, name: str) -> bool:
    return name.lower() in {k.lower() for k in headers}


def test_create_over_limit_returns_429_with_retry_after(client, enabled_limiter, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_create", "2/minute")
    ip = _ip(10)
    assert client.post("/api/shares", json={"content": "a"}, headers=ip).status_code == 201
    assert client.post("/api/shares", json={"content": "b"}, headers=ip).status_code == 201
    blocked = client.post("/api/shares", json={"content": "c"}, headers=ip)
    assert blocked.status_code == 429
    assert _has(blocked.headers, "retry-after")


def test_unlock_over_limit_returns_429(client, enabled_limiter, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_create", "100/minute")
    monkeypatch.setattr(settings, "rate_limit_unlock", "2/minute")
    ip = _ip(20)
    slug = client.post(
        "/api/shares", json={"content": "x", "password": "pw"}, headers=ip
    ).json()["slug"]
    for _ in range(2):
        client.post(f"/api/shares/{slug}/unlock", json={"password": "no"}, headers=ip)
    blocked = client.post(f"/api/shares/{slug}/unlock", json={"password": "no"}, headers=ip)
    assert blocked.status_code == 429


def test_health_endpoint_is_exempt(client, enabled_limiter, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_default", "2/minute")
    ip = _ip(30)
    codes = [client.get("/api/health", headers=ip).status_code for _ in range(5)]
    assert codes == [200] * 5


def test_default_limit_is_per_ip(client, enabled_limiter, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_default", "2/minute")
    monkeypatch.setattr(settings, "rate_limit_create", "100/minute")
    slug = client.post("/api/shares", json={"content": "pub"}, headers=_ip(40)).json()["slug"]

    caller = _ip(41)
    for _ in range(2):
        assert client.get(f"/api/shares/{slug}", headers=caller).status_code == 200
    assert client.get(f"/api/shares/{slug}", headers=caller).status_code == 429
    # A different client IP is unaffected.
    assert client.get(f"/api/shares/{slug}", headers=_ip(42)).status_code == 200
