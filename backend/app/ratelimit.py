"""Central API rate limiting.

A single :class:`~slowapi.Limiter` instance, wired once in ``create_app`` via
``SlowAPIMiddleware``. It enforces a per-client-IP default on every API endpoint,
with tighter overrides on the abuse-prone routes (create = spam, unlock =
password brute-force). Static/SPA responses are never throttled.

Why these choices:
- ``key_func=client_ip`` keys on the real caller. The app runs behind Railway's
  edge proxy, so ``request.client.host`` is the proxy; we prefer the left-most
  hop of ``X-Forwarded-For``.
- ``key_style="endpoint"`` makes slowapi skip requests without a view function
  (e.g. mounted ``StaticFiles``), so frontend asset loads bypass the limiter.
- Limits are resolved from ``settings`` at request time (callables), so they are
  tunable via environment and overridable in tests without rebuilding the app.
- Counters live in ``memory://`` by default: per-process, reset on restart. Fine
  for a single Railway service; point ``rate_limit_storage_uri`` at Redis to
  share state across replicas.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from app.config import settings


def client_ip(request: Request) -> str:
    """Best-effort client IP used as the rate-limit bucket key.

    Prefers the left-most ``X-Forwarded-For`` hop (the original client when a
    trusted proxy sits in front), falling back to the direct peer address.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first_hop = forwarded.split(",")[0].strip()
        if first_hop:
            return first_hop
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


# Limit providers read ``settings`` per call so env/test overrides take effect
# without rebuilding the limiter. ``*args`` absorbs the request slowapi may pass.
def _default_limit(*args, **kwargs) -> str:
    return settings.rate_limit_default


def create_limit(*args, **kwargs) -> str:
    return settings.rate_limit_create


def unlock_limit(*args, **kwargs) -> str:
    return settings.rate_limit_unlock


limiter = Limiter(
    key_func=client_ip,
    default_limits=[_default_limit],
    storage_uri=settings.rate_limit_storage_uri,
    enabled=settings.rate_limit_enabled,
    headers_enabled=True,
    retry_after="delta-seconds",
    key_style="endpoint",
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Return HTTP 429 with rate-limit headers (incl. ``Retry-After``)."""
    response = JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )
    return request.app.state.limiter._inject_headers(
        response, request.state.view_rate_limit
    )
