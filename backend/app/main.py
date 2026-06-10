"""FastAPI application factory.

In production the same service serves both the JSON API under ``/api`` and the
built single-page frontend (Vite ``dist``) for everything else, so there is no
cross-origin setup. The static mount is skipped when no build is present (e.g.
during tests and local API-only runs).
"""

from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.orm import Session

from app import crud, models, preview  # noqa: F401  (models import registers ORM tables)
from app.config import settings
from app.database import Base, engine, get_db
from app.ratelimit import limiter, rate_limit_exceeded_handler
from app.routers import shares


def _mount_frontend(app: FastAPI) -> None:
    static_dir = Path(settings.static_dir)
    if not static_dir.is_dir():
        return

    assets = static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    index_file = static_dir / "index.html"
    # Cache the shell once; OG tags are swapped in per request for crawlers.
    index_html = index_file.read_text(encoding="utf-8")
    og_image_file = static_dir / "og-default.png"

    # Registered before the catch-all so a bare share URL gets per-share <head>
    # metadata (Slack/social previews); humans still receive the SPA and hydrate.
    @app.get("/s/{slug}", response_class=HTMLResponse)
    @limiter.exempt
    def share_preview(slug: str, db: Session = Depends(get_db)) -> HTMLResponse:
        share = crud.get_share(db, slug)
        expired = bool(share and crud.is_expired(share))
        title, description = preview.share_meta(share, expired=expired)
        image = (
            f"{settings.public_base_url}/og-default.png"
            if og_image_file.is_file()
            else None
        )
        block = preview.og_block(
            title=title,
            description=description,
            url=f"{settings.public_base_url}/s/{slug}",
            image=image,
        )
        return HTMLResponse(preview.inject_og(index_html, block))

    @app.get("/{full_path:path}")
    @limiter.exempt
    def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404)
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)


def create_app() -> FastAPI:
    app = FastAPI(title="AI Response Share")

    # Central rate limiting: SlowAPIMiddleware applies the per-IP default to API
    # routes; create/unlock override it (see routers/shares.py).
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # No migration tool for v1: create tables on startup if absent.
    Base.metadata.create_all(bind=engine)

    app.include_router(shares.router)

    @app.get("/api/health")
    @limiter.exempt
    def health() -> dict[str, str]:
        return {"status": "ok"}

    _mount_frontend(app)
    return app


app = create_app()
