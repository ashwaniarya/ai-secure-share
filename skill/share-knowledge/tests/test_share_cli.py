import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

import share

BACKEND_DIR = Path(__file__).resolve().parents[3] / "backend"


# ---- unit: expiry parsing ---------------------------------------------------

@pytest.mark.parametrize(
    "value,expected",
    [
        (None, None),
        ("never", None),
        ("1h", 3600),
        ("1d", 86400),
        ("7d", 604800),
        ("30d", 2592000),
        ("120", 120),
    ],
)
def test_parse_expiry(value, expected):
    assert share.parse_expiry(value) == expected


def test_parse_expiry_rejects_garbage():
    with pytest.raises(ValueError):
        share.parse_expiry("banana")


# ---- unit: token store ------------------------------------------------------

def test_token_store_roundtrip(tmp_path):
    share.save_token("abc", "tok", store_home=tmp_path)
    assert share.lookup_token("abc", store_home=tmp_path) == "tok"


def test_lookup_missing_token_returns_none(tmp_path):
    assert share.lookup_token("nope", store_home=tmp_path) is None


def test_remove_token(tmp_path):
    share.save_token("abc", "tok", store_home=tmp_path)
    share.remove_token("abc", store_home=tmp_path)
    assert share.lookup_token("abc", store_home=tmp_path) is None


# ---- integration: real round-trip against the FastAPI app -------------------

def _free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _wait_until_healthy(base_url: str, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/api/health") as resp:
                if resp.status == 200:
                    return
        except urllib.error.URLError:
            time.sleep(0.1)
    raise RuntimeError("backend did not become healthy in time")


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    import os

    db_file = tmp_path_factory.mktemp("db") / "skill.db"
    port = _free_port()
    os.environ["DATABASE_URL"] = f"sqlite:///{db_file}"
    os.environ["PUBLIC_BASE_URL"] = f"http://127.0.0.1:{port}"

    sys.path.insert(0, str(BACKEND_DIR))
    import uvicorn
    from app.main import app

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    uvicorn_server = uvicorn.Server(config)
    thread = threading.Thread(target=uvicorn_server.run, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{port}"
    _wait_until_healthy(base_url)
    yield base_url

    uvicorn_server.should_exit = True
    thread.join(timeout=5)


def test_create_read_update_delete_roundtrip(server, tmp_path):
    created = share.create_share(server, "# Hello", store_home=tmp_path)
    slug = created["slug"]
    assert created["manage_token"]

    # public read needs no token
    assert share.read_share(server, slug) == "# Hello"

    # update resolves the token from the local store
    share.update_share(server, slug, content="# Updated", store_home=tmp_path)
    assert share.read_share(server, slug) == "# Updated"

    # delete also resolves the stored token
    share.delete_share(server, slug, store_home=tmp_path)
    with pytest.raises(share.ApiError) as excinfo:
        share.read_share(server, slug)
    assert excinfo.value.status == 404


def test_password_protected_read_requires_password(server, tmp_path):
    created = share.create_share(
        server, "secret body", password="pw", store_home=tmp_path
    )
    slug = created["slug"]

    with pytest.raises(share.ApiError):
        share.read_share(server, slug)  # no password -> locked

    assert share.read_share(server, slug, password="pw") == "secret body"
