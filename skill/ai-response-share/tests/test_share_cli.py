import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import json

import pytest

import crypto
import share

BACKEND_DIR = Path(__file__).resolve().parents[3] / "backend"


def _raw_get_content(base_url: str, slug: str) -> str:
    """Fetch the share's stored content straight from the API, no decryption.

    Used to prove what the server actually persists (ciphertext vs plaintext).
    """
    with urllib.request.urlopen(f"{base_url}/api/shares/{slug}") as response:
        return json.loads(response.read())["content"]


# ---- unit: base URL normalization -------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("airesponseshare.com", "https://airesponseshare.com"),
        ("airesponseshare.com/", "https://airesponseshare.com"),
        ("https://airesponseshare.com/", "https://airesponseshare.com"),
        ("http://localhost:8000", "http://localhost:8000"),
    ],
)
def test_normalize_base_url(raw, expected):
    assert share._normalize_base_url(raw) == expected


def test_base_url_normalizes_scheme_less_env(monkeypatch):
    from argparse import Namespace

    monkeypatch.setenv("AI_RESPONSE_SHARE_URL", "airesponseshare.com")
    assert share._base_url(Namespace(url=None)) == "https://airesponseshare.com"


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


# ---- unit: base URL resolution (--url > env > production default) -----------

def _parsed_args(*argv):
    return share.build_parser().parse_args([*argv, "list"])


def test_base_url_defaults_to_production_without_env(monkeypatch):
    monkeypatch.delenv("AI_RESPONSE_SHARE_URL", raising=False)
    assert share._base_url(_parsed_args()) == "https://airesponseshare.com"


def test_base_url_env_overrides_default(monkeypatch):
    monkeypatch.setenv("AI_RESPONSE_SHARE_URL", "http://localhost:8000")
    assert share._base_url(_parsed_args()) == "http://localhost:8000"


def test_base_url_flag_wins_over_env(monkeypatch):
    monkeypatch.setenv("AI_RESPONSE_SHARE_URL", "http://localhost:8000")
    assert share._base_url(_parsed_args("--url", "http://example.test")) == "http://example.test"


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
    created = share.create_share(server, "# Hello", encrypt=False, store_home=tmp_path)
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
        server, "secret body", password="pw", encrypt=False, store_home=tmp_path
    )
    slug = created["slug"]

    with pytest.raises(share.ApiError):
        share.read_share(server, slug)  # no password -> locked

    assert share.read_share(server, slug, password="pw") == "secret body"


# ---- unit: title derivation ---------------------------------------------------

def test_derive_title_from_first_heading():
    assert share.derive_title("intro\n\n## My Notes\n\nbody") == "My Notes"


def test_derive_title_falls_back_to_first_line():
    assert share.derive_title("plain text answer\nmore text") == "plain text answer"


def test_derive_title_truncates_long_lines():
    assert len(share.derive_title("x" * 300)) <= 80


def test_derive_title_empty_content():
    assert share.derive_title("   \n  ") == "Untitled"


# ---- unit: slug extraction from URLs ---------------------------------------

@pytest.mark.parametrize(
    "value,expected",
    [
        ("AbC123xyz", "AbC123xyz"),
        ("https://airesponseshare.com/s/AbC123xyz", "AbC123xyz"),
        ("airesponseshare.com/s/AbC123xyz", "AbC123xyz"),
        ("https://airesponseshare.com/s/AbC123xyz/", "AbC123xyz"),
        ("https://airesponseshare.com/s/AbC123xyz?utm_source=slack", "AbC123xyz"),
        ("http://localhost:8000/s/xyz#section", "xyz"),
    ],
)
def test_extract_slug(value, expected):
    assert share.extract_slug(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "https://airesponseshare.com/about",  # no /s/ segment
        "https://airesponseshare.com/s/",  # nothing after /s/
        "not a slug!!",  # invalid characters
        "",
    ],
)
def test_extract_slug_rejects_garbage(value):
    with pytest.raises(ValueError):
        share.extract_slug(value)


# ---- unit: memory ids -------------------------------------------------------

def test_memory_id_slugified_from_title(tmp_path):
    item = share.remember("# My Migration Notes\n\nbody", store_home=tmp_path)
    assert item["id"] == "my-migration-notes"
    assert item["title"] == "My Migration Notes"


def test_memory_id_collision_gets_suffix(tmp_path):
    first = share.remember("# Same Title\n\none", store_home=tmp_path)
    second = share.remember("# Same Title\n\ntwo", store_home=tmp_path)
    assert first["id"] != second["id"]
    assert second["id"].startswith("same-title")


# ---- unit: recall matching tiers --------------------------------------------

def test_find_items_exact_id_beats_substring(tmp_path):
    share.remember("body", title="notes", store_home=tmp_path)
    share.remember("body", title="more notes here", store_home=tmp_path)
    matches = share.find_items("notes", store_home=tmp_path)
    assert [m["id"] for m in matches] == ["notes"]


def test_find_items_exact_title_beats_substring(tmp_path):
    share.remember("body", title="Rate Limiting", store_home=tmp_path)
    share.remember("body", title="rate limiting deep dive", store_home=tmp_path)
    matches = share.find_items("rate limiting", store_home=tmp_path)
    assert len(matches) == 1
    assert matches[0]["title"] == "Rate Limiting"


def test_find_items_substring_returns_all(tmp_path):
    share.remember("body", title="Deploying with Docker", store_home=tmp_path)
    share.remember("body", title="Deploying to Railway", store_home=tmp_path)
    matches = share.find_items("deploying", store_home=tmp_path)
    assert len(matches) == 2


def test_find_items_no_match(tmp_path):
    share.remember("body", title="something", store_home=tmp_path)
    assert share.find_items("nonexistent", store_home=tmp_path) == []


# ---- behavioural: remember / list / recall (local, no network) ---------------

def test_remember_list_recall_roundtrip(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("AI_RESPONSE_SHARE_HOME", str(tmp_path))

    assert share.main(["remember", "--content", "# Db Decision\n\nuse postgres"]) == 0
    out = capsys.readouterr().out
    assert "db-decision" in out

    assert (tmp_path / "memory" / "db-decision.md").read_text() == (
        "# Db Decision\n\nuse postgres"
    )

    assert share.main(["list"]) == 0
    out = capsys.readouterr().out
    assert "Db Decision" in out
    assert "memory" in out

    assert share.main(["recall", "db decision"]) == 0
    out = capsys.readouterr().out
    assert "use postgres" in out


def test_recall_ambiguous_exits_2_with_candidates_on_stderr(
    tmp_path, monkeypatch, capsys
):
    monkeypatch.setenv("AI_RESPONSE_SHARE_HOME", str(tmp_path))
    share.remember("a", title="Deploying with Docker", store_home=tmp_path)
    share.remember("b", title="Deploying to Railway", store_home=tmp_path)

    assert share.main(["recall", "deploying"]) == 2
    captured = capsys.readouterr()
    assert "Deploying with Docker" in captured.err
    assert "Deploying to Railway" in captured.err
    assert captured.out == ""


def test_recall_no_match_exits_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("AI_RESPONSE_SHARE_HOME", str(tmp_path))
    assert share.main(["recall", "ghost"]) == 1
    assert "no saved item" in capsys.readouterr().err


def test_memory_update_and_delete_via_main(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("AI_RESPONSE_SHARE_HOME", str(tmp_path))
    share.remember("# Old Title\n\nold", store_home=tmp_path)

    assert share.main(["update", "old-title", "--content", "# Old Title\n\nnew"]) == 0
    assert (tmp_path / "memory" / "old-title.md").read_text() == "# Old Title\n\nnew"

    assert share.main(["delete", "old-title"]) == 0
    assert not (tmp_path / "memory" / "old-title.md").exists()
    assert "old-title" not in share.load_index(store_home=tmp_path)


def test_list_includes_tokens_only_share_untitled(tmp_path):
    share.save_token("legacysl", "tok", store_home=tmp_path)
    items = share.list_items(store_home=tmp_path)
    assert len(items) == 1
    assert items[0]["id"] == "legacysl"
    assert items[0]["kind"] == "share"
    # No base_url given: recall path is unaffected, no link constructed.
    assert not items[0].get("url")


def test_list_constructs_fallback_url_for_tokens_only_share(tmp_path):
    share.save_token("legacysl", "tok", store_home=tmp_path)
    items = share.list_items(
        base_url="https://airesponseshare.com", store_home=tmp_path
    )
    assert items[0]["url"] == "https://airesponseshare.com/s/legacysl"


def test_list_items_sorted_most_recent_first(tmp_path):
    share.remember("a", title="older", store_home=tmp_path)
    share.remember("b", title="newer", store_home=tmp_path)
    items = share.list_items(store_home=tmp_path)
    assert [item["title"] for item in items] == ["newer", "older"]


# ---- integration: index + recall + token flows against the real API ----------

def test_create_indexes_share_and_recall_reads_via_api(
    server, tmp_path, monkeypatch, capsys
):
    monkeypatch.setenv("AI_RESPONSE_SHARE_HOME", str(tmp_path))
    created = share.create_share(
        server, "# Api Hello\n\nhi", encrypt=False, store_home=tmp_path
    )
    slug = created["slug"]

    entry = share.load_index(store_home=tmp_path)[slug]
    assert entry["kind"] == "share"
    assert entry["title"] == "Api Hello"
    assert entry["url"] == created["url"]

    assert share.main(["--url", server, "recall", "api hello"]) == 0
    assert "hi" in capsys.readouterr().out

    share.delete_share(server, slug, store_home=tmp_path)
    assert slug not in share.load_index(store_home=tmp_path)


def test_read_via_main_accepts_full_url(server, tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("AI_RESPONSE_SHARE_HOME", str(tmp_path))
    created = share.create_share(
        server, "url read body", encrypt=False, store_home=tmp_path
    )

    url = f"{server}/s/{created['slug']}"
    assert share.main(["--url", server, "read", url]) == 0
    assert "url read body" in capsys.readouterr().out


def test_token_supplied_update_caches_token_and_indexes(server, tmp_path):
    creator_home = tmp_path / "creator"
    receiver_home = tmp_path / "receiver"
    created = share.create_share(
        server, "# Shared Doc\n\nv1", encrypt=False, store_home=creator_home
    )
    slug, token = created["slug"], created["manage_token"]

    # the receiver machine knows nothing about this share yet
    share.update_share(
        server, slug, content="# Shared Doc\n\nv2", token=token, store_home=receiver_home
    )
    assert share.lookup_token(slug, store_home=receiver_home) == token
    assert share.load_index(store_home=receiver_home)[slug]["title"] == "Shared Doc"

    # subsequent ops need no explicit token on the receiver machine
    share.delete_share(server, slug, store_home=receiver_home)
    with pytest.raises(share.ApiError):
        share.read_share(server, slug)


# ---- unit: encryption key store ---------------------------------------------

def test_keys_store_roundtrip(tmp_path):
    share.save_key("abc", "KEYVAL", store_home=tmp_path)
    assert share.lookup_key("abc", store_home=tmp_path) == "KEYVAL"
    share.remove_key("abc", store_home=tmp_path)
    assert share.lookup_key("abc", store_home=tmp_path) is None


def test_extract_key_from_url():
    assert crypto.extract_key_from_url("http://x/s/abc#k=KEYVAL") == "KEYVAL"
    assert crypto.extract_key_from_url("http://x/s/abc") is None


# ---- integration: end-to-end encryption against the real API ----------------

def test_encrypted_create_read_roundtrip(server, tmp_path):
    created = share.create_share(server, "# Secret\nhi", store_home=tmp_path)
    slug = created["slug"]
    assert "#k=" in created["url"]

    # the server only ever sees ciphertext
    assert _raw_get_content(server, slug).startswith("arsenc.")

    # cached key lets a read by slug decrypt transparently
    assert share.read_share(server, slug, store_home=tmp_path) == "# Secret\nhi"

    # a fresh machine with no cached key can still decrypt using the URL key
    fresh_home = tmp_path / "fresh"
    key_from_url = crypto.extract_key_from_url(created["url"])
    assert (
        share.read_share(server, slug, key=key_from_url, store_home=fresh_home)
        == "# Secret\nhi"
    )


def test_encrypted_with_password(server, tmp_path):
    created = share.create_share(
        server, "# Locked\ntop secret", password="pw", store_home=tmp_path
    )
    slug = created["slug"]

    with pytest.raises(share.ApiError):
        share.read_share(server, slug, store_home=tmp_path)  # no password

    assert (
        share.read_share(server, slug, password="pw", store_home=tmp_path)
        == "# Locked\ntop secret"
    )


def test_encrypted_update_reencrypts(server, tmp_path):
    created = share.create_share(server, "# Old\nv1", store_home=tmp_path)
    slug = created["slug"]

    share.update_share(server, slug, content="# New", store_home=tmp_path)
    assert share.read_share(server, slug, store_home=tmp_path) == "# New"

    # still ciphertext on the server after the update
    assert _raw_get_content(server, slug).startswith("arsenc.")


def test_public_flag_creates_plaintext(server, tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("AI_RESPONSE_SHARE_HOME", str(tmp_path))

    assert (
        share.main(["--url", server, "create", "--content", "# Plain", "--public"])
        == 0
    )
    out = capsys.readouterr().out

    url_line = next(line for line in out.splitlines() if line.startswith("view url:"))
    url = url_line.split("view url:", 1)[1].strip()
    assert "#" not in url

    slug = share.extract_slug(url)
    assert _raw_get_content(server, slug) == "# Plain"
