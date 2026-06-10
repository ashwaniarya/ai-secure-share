"""Server-rendered Open Graph tags for /s/{slug} (Slack/social link previews).

Unit-tests the pure helpers in ``app.preview`` and behaviour-tests the route,
with a focus on two invariants: tags land early in <head>, and protected
content is never leaked into the preview.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import crud
from app.config import settings
from app.database import get_db
from app.models import now_utc
from app.preview import extract_title, summarize, og_block, inject_og


# ---- extract_title (unit) ---------------------------------------------------

def test_extract_title_uses_first_heading_without_hashes():
    assert extract_title("# Hello world\n\nbody") == "Hello world"


def test_extract_title_uses_first_nonempty_line_when_no_heading():
    assert extract_title("\n\nplain first line\nsecond") == "plain first line"


def test_extract_title_falls_back_when_empty():
    assert extract_title("   \n\n") == "Shared note"


# ---- summarize (unit) -------------------------------------------------------

def test_summarize_strips_markdown_tokens():
    out = summarize("# Title\n\nThis is **bold** and `code` text.")
    assert "This is bold and code text." in out
    assert "#" not in out and "**" not in out and "`" not in out


def test_summarize_truncates_with_ellipsis():
    out = summarize("x " * 500, limit=200)
    assert out.endswith("…")
    assert len(out) <= 200


# ---- og_block (unit, security) ----------------------------------------------

def test_og_block_escapes_untrusted_values():
    block = og_block(
        title='"></head><script>alert(1)</script>',
        description="desc",
        url="http://x/s/abc",
    )
    assert "<script>" not in block
    assert "</head>" not in block
    assert "&lt;script&gt;" in block


def test_og_block_uses_summary_card_without_image_and_large_with_image():
    assert 'content="summary"' in og_block(title="t", description="d", url="u")
    assert "summary_large_image" in og_block(
        title="t", description="d", url="u", image="http://x/og-default.png"
    )


# ---- inject_og (unit) -------------------------------------------------------

def test_inject_og_replaces_marker_block():
    html = "<head><!--OG:START-->OLD<!--OG:END--></head>"
    out = inject_og(html, "NEW")
    assert "OLD" not in out and "NEW" in out


def test_inject_og_falls_back_to_after_head_when_no_markers():
    out = inject_og("<head></head>", "NEW")
    assert "NEW" in out
    assert out.index("NEW") > out.index("<head>")


# ---- route (behavioural) ----------------------------------------------------

@pytest.fixture()
def og_client(db_session, tmp_path, monkeypatch):
    index = tmp_path / "index.html"
    index.write_text(
        "<!doctype html><html><head>\n"
        "<!--OG:START-->\n"
        '<meta property="og:title" content="AI Response Share" />\n'
        '<meta property="og:description" content="Paste markdown, get a shareable link." />\n'
        "<!--OG:END-->\n"
        '</head><body><div id="root"></div></body></html>'
    )
    monkeypatch.setattr(settings, "static_dir", str(tmp_path))
    from app.main import create_app

    app = create_app()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_public_share_renders_derived_og_tags(og_client, db_session):
    share, _ = crud.create_share(db_session, content="# Secret Sauce\n\nThe recipe is simple.")
    html = og_client.get(f"/s/{share.slug}").text
    assert 'property="og:title" content="Secret Sauce"' in html
    assert "The recipe is simple." in html
    assert f"/s/{share.slug}" in html
    # Still the SPA shell (humans hydrate), and tags are early in <head>.
    assert 'id="root"' in html
    assert html.index('property="og:title"') < html.index("</head>") < 32768


def test_password_protected_preview_does_not_leak_content(og_client, db_session):
    share, _ = crud.create_share(
        db_session, content="TopSecretContents", password="pw"
    )
    html = og_client.get(f"/s/{share.slug}").text
    assert "TopSecretContents" not in html
    assert "Password-protected note" in html


def test_expired_preview_has_no_content(og_client, db_session):
    share, _ = crud.create_share(
        db_session, content="WillVanishSoon", expires_in_seconds=3600
    )
    share.expires_at = now_utc() - timedelta(seconds=1)
    db_session.commit()
    html = og_client.get(f"/s/{share.slug}").text
    assert "WillVanishSoon" not in html
    assert "Expired note" in html


def test_unknown_slug_serves_shell_with_default_meta(og_client):
    response = og_client.get("/s/does-not-exist")
    assert response.status_code == 200
    assert "AI Response Share" in response.text
