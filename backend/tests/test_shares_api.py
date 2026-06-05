from datetime import timedelta

from app import crud
from app.models import now_utc


def _create(client, **body):
    body.setdefault("content", "# Hello")
    response = client.post("/api/shares", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _force_expired(db_session, slug):
    share = crud.get_share(db_session, slug)
    share.expires_at = now_utc() - timedelta(seconds=1)
    db_session.commit()


# ---- create -----------------------------------------------------------------

def test_create_returns_slug_token_and_url(client):
    data = _create(client, content="# Hi")
    assert data["slug"]
    assert data["manage_token"]
    assert data["url"].endswith(f"/s/{data['slug']}")
    assert data["expires_at"] is None


def test_create_rejects_empty_content(client):
    assert client.post("/api/shares", json={"content": ""}).status_code == 422


# ---- read -------------------------------------------------------------------

def test_get_public_share_returns_content(client):
    slug = _create(client, content="# Public")["slug"]
    response = client.get(f"/api/shares/{slug}")
    assert response.status_code == 200
    body = response.json()
    assert body["content"] == "# Public"
    assert body["has_password"] is False
    assert "manage_token" not in body


def test_get_unknown_share_returns_404(client):
    assert client.get("/api/shares/missing").status_code == 404


def test_get_password_protected_share_hides_content(client):
    slug = _create(client, password="pw")["slug"]
    body = client.get(f"/api/shares/{slug}").json()
    assert body["has_password"] is True
    assert body["content"] is None


def test_get_expired_share_returns_410(client, db_session):
    slug = _create(client, expires_in_seconds=3600)["slug"]
    _force_expired(db_session, slug)
    assert client.get(f"/api/shares/{slug}").status_code == 410


# ---- owner bypass via manage token -----------------------------------------

def test_owner_token_bypasses_password(client):
    created = _create(client, content="secret", password="pw")
    body = client.get(
        f"/api/shares/{created['slug']}", headers=_auth(created["manage_token"])
    ).json()
    assert body["content"] == "secret"


def test_owner_token_bypasses_expiry(client, db_session):
    created = _create(client, content="secret", expires_in_seconds=3600)
    _force_expired(db_session, created["slug"])
    response = client.get(
        f"/api/shares/{created['slug']}", headers=_auth(created["manage_token"])
    )
    assert response.status_code == 200
    assert response.json()["content"] == "secret"


# ---- unlock -----------------------------------------------------------------

def test_unlock_with_correct_password_returns_content(client):
    slug = _create(client, content="locked", password="pw")["slug"]
    response = client.post(f"/api/shares/{slug}/unlock", json={"password": "pw"})
    assert response.status_code == 200
    assert response.json()["content"] == "locked"


def test_unlock_with_wrong_password_returns_401(client):
    slug = _create(client, password="pw")["slug"]
    response = client.post(f"/api/shares/{slug}/unlock", json={"password": "no"})
    assert response.status_code == 401


# ---- update -----------------------------------------------------------------

def test_update_with_valid_token_changes_content(client):
    created = _create(client, content="old")
    response = client.put(
        f"/api/shares/{created['slug']}",
        json={"content": "new"},
        headers=_auth(created["manage_token"]),
    )
    assert response.status_code == 200
    assert client.get(f"/api/shares/{created['slug']}").json()["content"] == "new"


def test_update_with_wrong_token_returns_403(client):
    slug = _create(client, content="old")["slug"]
    response = client.put(
        f"/api/shares/{slug}", json={"content": "new"}, headers=_auth("bad")
    )
    assert response.status_code == 403


def test_update_without_token_returns_403(client):
    slug = _create(client, content="old")["slug"]
    assert client.put(f"/api/shares/{slug}", json={"content": "new"}).status_code == 403


def test_update_can_clear_expiry(client, db_session):
    created = _create(client, expires_in_seconds=3600)
    client.put(
        f"/api/shares/{created['slug']}",
        json={"expires_in_seconds": None},
        headers=_auth(created["manage_token"]),
    )
    assert crud.get_share(db_session, created["slug"]).expires_at is None


# ---- delete -----------------------------------------------------------------

def test_delete_with_valid_token_then_404(client):
    created = _create(client)
    response = client.delete(
        f"/api/shares/{created['slug']}", headers=_auth(created["manage_token"])
    )
    assert response.status_code == 204
    assert client.get(f"/api/shares/{created['slug']}").status_code == 404


def test_delete_with_wrong_token_returns_403(client):
    slug = _create(client)["slug"]
    assert client.delete(f"/api/shares/{slug}", headers=_auth("bad")).status_code == 403
