"""FastAPI application factory.

In production the same service serves both the JSON API under ``/api`` and the
built single-page frontend (Vite ``dist``) for everything else, so there is no
cross-origin setup. The static mount is skipped when no build is present (e.g.
during tests and local API-only runs).
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import models  # noqa: F401  (import registers ORM tables on Base)
from app.config import settings
from app.database import Base, engine
from app.routers import shares


def _mount_frontend(app: FastAPI) -> None:
    static_dir = Path(settings.static_dir)
    if not static_dir.is_dir():
        return

    assets = static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    index_file = static_dir / "index.html"

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404)
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)


def create_app() -> FastAPI:
    app = FastAPI(title="ShareKnowledge")

    # No migration tool for v1: create tables on startup if absent.
    Base.metadata.create_all(bind=engine)

    app.include_router(shares.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    _mount_frontend(app)
    return app


app = create_app()
