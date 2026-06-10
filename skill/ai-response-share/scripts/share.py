#!/usr/bin/env python3
"""CLI for the AI Response Share API: create, read, update, and delete shares.

Standalone and stdlib-only so it can run anywhere without installing packages.
Manage tokens returned at creation are cached in ``~/.ai-response-share/tokens.json``
(override with ``$AI_RESPONSE_SHARE_HOME``) so later edits/deletes don't need the
token passed explicitly. The API base URL comes from ``$AI_RESPONSE_SHARE_URL``
(default ``http://localhost:8000``).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "http://localhost:8000"
_EXPIRY_PRESETS = {"1h": 3600, "1d": 86400, "7d": 604800, "30d": 2592000}
_UNSET = object()


class ApiError(Exception):
    """An HTTP error from the API, carrying the status code."""

    def __init__(self, status: int, message: str):
        super().__init__(f"[{status}] {message}")
        self.status = status
        self.message = message


# ---- expiry parsing ---------------------------------------------------------

def parse_expiry(value) -> int | None:
    """Map an expiry shorthand to seconds. ``None``/``"never"`` mean no expiry."""
    if value is None or value == "never":
        return None
    if isinstance(value, int):
        return value
    if value in _EXPIRY_PRESETS:
        return _EXPIRY_PRESETS[value]
    if isinstance(value, str) and value.isdigit():
        return int(value)
    raise ValueError(f"invalid expiry: {value!r} (use never/1h/1d/7d/30d or seconds)")


# ---- local manage-token store ----------------------------------------------

def _home(store_home=None) -> Path:
    if store_home is not None:
        return Path(store_home)
    env_home = os.environ.get("AI_RESPONSE_SHARE_HOME")
    return Path(env_home) if env_home else Path.home() / ".ai-response-share"


def _token_file(store_home=None) -> Path:
    return _home(store_home) / "tokens.json"


def load_tokens(store_home=None) -> dict:
    path = _token_file(store_home)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def save_token(slug: str, token: str, store_home=None) -> None:
    home = _home(store_home)
    home.mkdir(parents=True, exist_ok=True)
    tokens = load_tokens(store_home)
    tokens[slug] = token
    _token_file(store_home).write_text(json.dumps(tokens, indent=2))


def lookup_token(slug: str, store_home=None) -> str | None:
    return load_tokens(store_home).get(slug)


def remove_token(slug: str, store_home=None) -> None:
    tokens = load_tokens(store_home)
    if slug in tokens:
        del tokens[slug]
        _token_file(store_home).write_text(json.dumps(tokens, indent=2))


# ---- HTTP -------------------------------------------------------------------

def _request(method: str, url: str, data=None, token: str | None = None):
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=body, method=method)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read()
        detail = error.reason
        try:
            parsed = json.loads(raw)
            detail = parsed.get("detail", detail)
        except (json.JSONDecodeError, AttributeError):
            pass
        raise ApiError(error.code, detail) from None


def _require_token(slug: str, token: str | None, store_home) -> str:
    resolved = token or lookup_token(slug, store_home=store_home)
    if not resolved:
        raise ApiError(403, f"no manage token known for '{slug}'; pass --token")
    return resolved


# ---- operations -------------------------------------------------------------

def create_share(
    base_url: str,
    content: str,
    *,
    password: str | None = None,
    expires=None,
    store_home=None,
) -> dict:
    payload: dict = {"content": content}
    if password:
        payload["password"] = password
    seconds = parse_expiry(expires)
    if seconds is not None:
        payload["expires_in_seconds"] = seconds
    _, data = _request("POST", f"{base_url}/api/shares", data=payload)
    save_token(data["slug"], data["manage_token"], store_home=store_home)
    return data


def read_share(
    base_url: str,
    slug: str,
    *,
    password: str | None = None,
    token: str | None = None,
) -> str:
    _, data = _request("GET", f"{base_url}/api/shares/{slug}", token=token)
    if data.get("content") is not None:
        return data["content"]
    if data.get("has_password"):
        if password is None:
            raise ApiError(401, "this share is password protected; pass --password")
        _, unlocked = _request(
            "POST", f"{base_url}/api/shares/{slug}/unlock", data={"password": password}
        )
        return unlocked["content"]
    return ""


def update_share(
    base_url: str,
    slug: str,
    *,
    content=_UNSET,
    password=_UNSET,
    expires=_UNSET,
    token: str | None = None,
    store_home=None,
) -> dict:
    resolved = _require_token(slug, token, store_home)
    patch: dict = {}
    if content is not _UNSET:
        patch["content"] = content
    if password is not _UNSET:
        patch["password"] = password
    if expires is not _UNSET:
        patch["expires_in_seconds"] = parse_expiry(expires)
    _, data = _request(
        "PUT", f"{base_url}/api/shares/{slug}", data=patch, token=resolved
    )
    return data


def delete_share(
    base_url: str,
    slug: str,
    *,
    token: str | None = None,
    store_home=None,
) -> None:
    resolved = _require_token(slug, token, store_home)
    _request("DELETE", f"{base_url}/api/shares/{slug}", token=resolved)
    remove_token(slug, store_home=store_home)


# ---- CLI --------------------------------------------------------------------

def _read_content(value: str) -> str:
    """Treat ``-`` as stdin and an existing path as a file; else literal text."""
    if value == "-":
        return sys.stdin.read()
    path = Path(value)
    if path.is_file():
        return path.read_text()
    return value


def _base_url(args) -> str:
    return args.url or os.environ.get("AI_RESPONSE_SHARE_URL", DEFAULT_BASE_URL)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage AI Response Share shares.")
    parser.add_argument("--url", help="API base URL (default $AI_RESPONSE_SHARE_URL)")
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="create a share")
    create.add_argument("--content", required=True, help="markdown, a file path, or - for stdin")
    create.add_argument("--password")
    create.add_argument("--expires", help="never/1h/1d/7d/30d or seconds")

    read = sub.add_parser("read", help="read a share's content")
    read.add_argument("slug")
    read.add_argument("--password")
    read.add_argument("--token")

    update = sub.add_parser("update", help="update a share")
    update.add_argument("slug")
    update.add_argument("--content", help="markdown, a file path, or - for stdin")
    update.add_argument("--password")
    update.add_argument("--expires")
    update.add_argument("--token")

    delete = sub.add_parser("delete", help="delete a share")
    delete.add_argument("slug")
    delete.add_argument("--token")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    base_url = _base_url(args)
    try:
        if args.command == "create":
            result = create_share(
                base_url,
                _read_content(args.content),
                password=args.password,
                expires=args.expires,
            )
            print(f"slug:         {result['slug']}")
            print(f"view url:     {result['url']}")
            print(f"manage token: {result['manage_token']}")
            print("(save the manage token — it is shown only once)")
        elif args.command == "read":
            print(read_share(base_url, args.slug, password=args.password, token=args.token))
        elif args.command == "update":
            kwargs: dict = {"token": args.token}
            if args.content is not None:
                kwargs["content"] = _read_content(args.content)
            if args.password is not None:
                kwargs["password"] = args.password
            if args.expires is not None:
                kwargs["expires"] = args.expires
            update_share(base_url, args.slug, **kwargs)
            print(f"updated {args.slug}")
        elif args.command == "delete":
            delete_share(base_url, args.slug, token=args.token)
            print(f"deleted {args.slug}")
    except ApiError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
