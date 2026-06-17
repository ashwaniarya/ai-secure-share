#!/usr/bin/env python3
"""CLI for AI Response Share: save, read, recall, and manage markdown.

Standalone and stdlib-only so it can run anywhere without installing packages.
Three kinds of work:

- shares: public links via the HTTP API (``create``/``read``/``update``/``delete``)
- memory: local-only items, no network (``remember``)
- recall: a local index (``index.json``) of everything saved either way
  (``list``/``recall``)

Manage tokens returned at creation are cached in ``~/.ai-response-share/tokens.json``
(override the directory with ``$AI_RESPONSE_SHARE_HOME``) so later edits/deletes
don't need the token passed explicitly. The API base URL resolves ``--url`` >
``$AI_RESPONSE_SHARE_URL`` > the hosted service ``https://airesponseshare.com``,
so no configuration is needed unless targeting a local or self-hosted server
(e.g. ``AI_RESPONSE_SHARE_URL=http://localhost:8000``).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import crypto

DEFAULT_BASE_URL = "https://airesponseshare.com"
TITLE_MAX_CHARS = 80
_EXPIRY_PRESETS = {"1h": 3600, "1d": 86400, "7d": 604800, "30d": 2592000}
_UNSET = object()
_SLUG_RE = re.compile(r"^[A-Za-z0-9_-]+$")


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


# ---- titles and slugs -------------------------------------------------------

def derive_title(content: str) -> str:
    """First markdown heading, else first non-empty line, truncated for display."""
    first_line = None
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
            if heading:
                return heading[:TITLE_MAX_CHARS]
            continue
        if first_line is None:
            first_line = stripped
    return (first_line or "Untitled")[:TITLE_MAX_CHARS]


def extract_slug(value: str) -> str:
    """Accept a bare slug/item id or any share URL and return the slug.

    Handles full URLs, schemeless URLs, trailing slashes, query strings, and
    fragments by taking the path segment after ``/s/``.
    """
    candidate = value.strip()
    if _SLUG_RE.match(candidate):
        return candidate
    path = candidate.partition("?")[0].partition("#")[0]
    segments = [segment for segment in path.split("/") if segment]
    for position, segment in enumerate(segments):
        if segment == "s" and position + 1 < len(segments):
            slug = segments[position + 1]
            if _SLUG_RE.match(slug):
                return slug
    raise ValueError(f"could not extract a share slug from {value!r}")


# ---- local stores (manage tokens, index, memory files) ----------------------

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


# Decryption keys for encrypted shares, cached so reads/updates by slug work
# without re-pasting the share link's #k=... fragment. Mirrors the token store.

def _keys_file(store_home=None) -> Path:
    return _home(store_home) / "keys.json"


def load_keys(store_home=None) -> dict:
    path = _keys_file(store_home)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def save_key(slug: str, key_b64url: str, store_home=None) -> None:
    home = _home(store_home)
    home.mkdir(parents=True, exist_ok=True)
    keys = load_keys(store_home)
    keys[slug] = key_b64url
    _keys_file(store_home).write_text(json.dumps(keys, indent=2))


def lookup_key(slug: str, store_home=None) -> str | None:
    return load_keys(store_home).get(slug)


def remove_key(slug: str, store_home=None) -> None:
    keys = load_keys(store_home)
    if slug in keys:
        del keys[slug]
        _keys_file(store_home).write_text(json.dumps(keys, indent=2))


def _index_file(store_home=None) -> Path:
    return _home(store_home) / "index.json"


def load_index(store_home=None) -> dict:
    path = _index_file(store_home)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def _write_index(index: dict, store_home=None) -> None:
    home = _home(store_home)
    home.mkdir(parents=True, exist_ok=True)
    _index_file(store_home).write_text(json.dumps(index, indent=2))


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _index_put(item_id: str, kind: str, title: str, url=None, store_home=None) -> None:
    index = load_index(store_home)
    previous = index.get(item_id, {})
    entry = {
        "kind": kind,
        "title": title,
        "created_at": previous.get("created_at") or _utc_now(),
        "updated_at": _utc_now(),
    }
    resolved_url = url or previous.get("url")
    if resolved_url:
        entry["url"] = resolved_url
    index[item_id] = entry
    _write_index(index, store_home)


def _index_remove(item_id: str, store_home=None) -> None:
    index = load_index(store_home)
    if item_id in index:
        del index[item_id]
        _write_index(index, store_home)


def _memory_file(item_id: str, store_home=None) -> Path:
    return _home(store_home) / "memory" / f"{item_id}.md"


def _kind_of(item_id: str, store_home=None) -> str | None:
    return load_index(store_home).get(item_id, {}).get("kind")


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


# ---- share operations (public links via the API) ----------------------------

def create_share(
    base_url: str,
    content: str,
    *,
    password: str | None = None,
    expires=None,
    title: str | None = None,
    encrypt: bool = True,
    store_home=None,
) -> dict:
    """Create a public share link for ``content``.

    By default the content is end-to-end encrypted: a random 256-bit key is
    generated locally, the content is sealed into an AES-256-GCM envelope, and
    only that envelope is sent to the server. The key is appended to the view
    URL as a ``#k=<b64url>`` fragment (never sent to the server) and cached
    locally so later reads/updates by slug need no link. Pass ``encrypt=False``
    for a plaintext (public) share with no fragment.

    The optional ``password`` is an independent server-side access gate that
    layers on top of either mode.
    """
    # Title is derived from the plaintext, before any encryption replaces it.
    resolved_title = title or derive_title(content)

    key_b64: str | None = None
    if encrypt:
        key = crypto.generate_key()
        key_b64 = crypto.key_to_b64url(key)
        content = crypto.encrypt(content, key)

    payload: dict = {"content": content}
    if password:
        payload["password"] = password
    seconds = parse_expiry(expires)
    if seconds is not None:
        payload["expires_in_seconds"] = seconds
    _, data = _request("POST", f"{base_url}/api/shares", data=payload)
    save_token(data["slug"], data["manage_token"], store_home=store_home)

    view_url = data.get("url") or f"{base_url}/s/{data['slug']}"
    if key_b64 is not None:
        save_key(data["slug"], key_b64, store_home=store_home)
        view_url = view_url + "#k=" + key_b64
        data["url"] = view_url

    _index_put(
        data["slug"],
        "share",
        resolved_title,
        url=view_url,
        store_home=store_home,
    )
    return data


def read_share(
    base_url: str,
    slug: str,
    *,
    password: str | None = None,
    token: str | None = None,
    key: str | None = None,
    store_home=None,
) -> str:
    """Read a share's content, decrypting it if it is an encrypted envelope.

    The decryption key is resolved as: the explicit ``key`` argument (e.g. from
    a pasted ``#k=...`` link) first, else the locally cached key for ``slug``.
    Plaintext (public) shares are returned as-is.
    """
    resolved_key = key or lookup_key(slug, store_home)

    _, data = _request("GET", f"{base_url}/api/shares/{slug}", token=token)
    content = data.get("content")
    if content is None:
        if data.get("has_password"):
            if password is None:
                raise ApiError(
                    401, "this share is password protected; pass --password"
                )
            _, unlocked = _request(
                "POST",
                f"{base_url}/api/shares/{slug}/unlock",
                data={"password": password},
            )
            content = unlocked["content"]
        else:
            return ""

    if crypto.is_encrypted(content):
        if not resolved_key:
            raise ApiError(
                400,
                "this share is encrypted; open it with the full link including "
                "the #k=... part, or pass --key",
            )
        return crypto.decrypt(content, crypto.b64url_to_key(resolved_key))
    return content


def update_share(
    base_url: str,
    slug: str,
    *,
    content=_UNSET,
    password=_UNSET,
    expires=_UNSET,
    token: str | None = None,
    key: str | None = None,
    store_home=None,
) -> dict:
    """Update a share, re-encrypting new content if a key is known for it.

    The key is resolved as the explicit ``key`` argument first, else the cached
    key for ``slug``. When a key is known and the content is being changed, the
    new plaintext is sealed into a fresh envelope before the PUT (and the key is
    re-saved); otherwise the content is sent as plaintext, as before. The title
    is always derived from the plaintext, before any encryption.
    """
    resolved = _require_token(slug, token, store_home)
    resolved_key = key or lookup_key(slug, store_home)

    if content is not _UNSET:
        new_title = derive_title(content)
    else:
        new_title = None

    patch: dict = {}
    if content is not _UNSET:
        if resolved_key:
            content = crypto.encrypt(content, crypto.b64url_to_key(resolved_key))
            save_key(slug, resolved_key, store_home=store_home)
        patch["content"] = content
    if password is not _UNSET:
        patch["password"] = password
    if expires is not _UNSET:
        patch["expires_in_seconds"] = parse_expiry(expires)
    _, data = _request(
        "PUT", f"{base_url}/api/shares/{slug}", data=patch, token=resolved
    )
    # An explicitly supplied token that worked is worth keeping: it makes a
    # share created elsewhere editable from this machine from now on.
    if token:
        save_token(slug, token, store_home=store_home)
    if new_title is None:
        new_title = load_index(store_home).get(slug, {}).get("title", "(untitled)")
    _index_put(
        slug,
        "share",
        new_title,
        url=(data or {}).get("url") or f"{base_url}/s/{slug}",
        store_home=store_home,
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
    remove_key(slug, store_home=store_home)
    _index_remove(slug, store_home=store_home)


# ---- memory operations (local-only, no network) ------------------------------

def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug or "memory"


def _unique_memory_id(title: str, store_home=None) -> str:
    """Slugified title, suffixed if it would collide with any known id or slug."""
    base = _slugify(title)
    taken = set(load_index(store_home)) | set(load_tokens(store_home))
    if base not in taken:
        return base
    suffix = 2
    while f"{base}-{suffix}" in taken:
        suffix += 1
    return f"{base}-{suffix}"


def remember(content: str, *, title: str | None = None, store_home=None) -> dict:
    """Persist content locally (no public link) and index it for recall."""
    resolved_title = title or derive_title(content)
    item_id = _unique_memory_id(resolved_title, store_home)
    path = _memory_file(item_id, store_home)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    _index_put(item_id, "memory", resolved_title, store_home=store_home)
    return {"id": item_id, "title": resolved_title, "path": str(path)}


def update_memory(item_id: str, *, content=_UNSET, store_home=None) -> None:
    index = load_index(store_home)
    if index.get(item_id, {}).get("kind") != "memory":
        raise ValueError(f"no memory item '{item_id}'")
    title = index[item_id]["title"]
    if content is not _UNSET:
        _memory_file(item_id, store_home).write_text(content)
        title = derive_title(content)
    _index_put(item_id, "memory", title, store_home=store_home)


def delete_memory(item_id: str, store_home=None) -> None:
    path = _memory_file(item_id, store_home)
    if path.exists():
        path.unlink()
    _index_remove(item_id, store_home=store_home)


# ---- listing and recall ------------------------------------------------------

def list_items(base_url=None, store_home=None) -> list[dict]:
    """Every saved item (shares and memory), most recently updated first.

    Shares known only from the legacy token cache appear as untitled rows. When
    ``base_url`` is given, those rows still get a constructed view link so the
    listing always shows where to open the share.
    """
    index = load_index(store_home)
    items = []
    for item_id, entry in index.items():
        item = {"id": item_id, **entry}
        if entry.get("kind") == "memory":
            item["path"] = str(_memory_file(item_id, store_home))
        items.append(item)
    for slug in load_tokens(store_home):
        if slug not in index:
            items.append(
                {
                    "id": slug,
                    "kind": "share",
                    "title": "(untitled)",
                    "created_at": "",
                    "updated_at": "",
                    "url": f"{base_url}/s/{slug}" if base_url else "",
                }
            )
    items.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return items


def find_items(query: str, store_home=None) -> list[dict]:
    """Tiered match: exact id, else exact title, else title substring.

    Only the highest non-empty tier is returned, so an exact hit never gets
    diluted by looser matches.
    """
    items = list_items(store_home=store_home)
    needle = query.strip().casefold()
    tiers = (
        lambda item: item["id"].casefold() == needle,
        lambda item: item.get("title", "").casefold() == needle,
        lambda item: needle in item.get("title", "").casefold(),
    )
    for matches_tier in tiers:
        matches = [item for item in items if matches_tier(item)]
        if matches:
            return matches
    return []


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


def _print_items(items: list[dict], stream) -> None:
    for item in items:
        date = (item.get("updated_at") or "")[:10]
        location = item.get("url") or item.get("path") or ""
        print(
            f"{item['kind']:<7} {item['id']:<28} {date:<11} "
            f"{item.get('title', ''):<42} {location}",
            file=stream,
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Save, read, recall, and manage AI Response Share markdown."
    )
    parser.add_argument(
        "--url",
        help="API base URL (default: $AI_RESPONSE_SHARE_URL, else https://airesponseshare.com)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="save content as a public share link")
    create.add_argument("--content", required=True, help="markdown, a file path, or - for stdin")
    create.add_argument("--title", help="override the auto-derived title")
    create.add_argument("--password")
    create.add_argument("--expires", help="never/1h/1d/7d/30d or seconds")
    create.add_argument(
        "--public",
        action="store_true",
        help="store plaintext on the server instead of an encrypted envelope",
    )

    remember_cmd = sub.add_parser(
        "remember", help="save content locally only (no public link)"
    )
    remember_cmd.add_argument(
        "--content", required=True, help="markdown, a file path, or - for stdin"
    )
    remember_cmd.add_argument("--title", help="override the auto-derived title")

    sub.add_parser("list", help="list everything saved (shares and memory)")

    recall = sub.add_parser("recall", help="find a saved item by id or title and print it")
    recall.add_argument("query", help="item id, exact title, or title fragment")
    recall.add_argument("--password", help="for password-protected shares")
    recall.add_argument("--key", help="decryption key for an encrypted share")

    read = sub.add_parser("read", help="read a share or memory item")
    read.add_argument("slug", help="share slug, share URL, or saved item id")
    read.add_argument("--password")
    read.add_argument("--token")
    read.add_argument("--key", help="decryption key for an encrypted share")

    update = sub.add_parser("update", help="update a share or memory item")
    update.add_argument("slug", help="share slug, share URL, or saved item id")
    update.add_argument("--content", help="markdown, a file path, or - for stdin")
    update.add_argument("--password")
    update.add_argument("--expires")
    update.add_argument("--token")
    update.add_argument("--key", help="decryption key for an encrypted share")

    delete = sub.add_parser("delete", help="delete a share or memory item")
    delete.add_argument("slug", help="share slug, share URL, or saved item id")
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
                title=args.title,
                encrypt=not args.public,
            )
            print(f"slug:         {result['slug']}")
            print(f"view url:     {result['url']}")
            print(f"manage token: {result['manage_token']}")
            print("(save the manage token — it is shown only once)")
            if not args.public:
                print(
                    "(the link contains the decryption key after #; share the "
                    "whole link and treat it as a secret)"
                )
        elif args.command == "remember":
            result = remember(_read_content(args.content), title=args.title)
            print(f"remembered:   {result['id']}")
            print(f"title:        {result['title']}")
            print(f"path:         {result['path']}")
        elif args.command == "list":
            items = list_items(base_url)
            if not items:
                print("no saved items")
            else:
                _print_items(items, sys.stdout)
        elif args.command == "recall":
            matches = find_items(args.query)
            if not matches:
                print(f"error: no saved item matches {args.query!r}", file=sys.stderr)
                return 1
            if len(matches) > 1:
                print("multiple saved items match — pick one:", file=sys.stderr)
                _print_items(matches, sys.stderr)
                return 2
            item = matches[0]
            if item["kind"] == "memory":
                print(_memory_file(item["id"]).read_text())
            else:
                key = args.key or crypto.extract_key_from_url(args.query)
                print(
                    read_share(
                        base_url, item["id"], password=args.password, key=key
                    )
                )
        elif args.command == "read":
            ref = extract_slug(args.slug)
            if _kind_of(ref) == "memory":
                print(_memory_file(ref).read_text())
            else:
                key = args.key or crypto.extract_key_from_url(args.slug)
                print(
                    read_share(
                        base_url,
                        ref,
                        password=args.password,
                        token=args.token,
                        key=key,
                    )
                )
        elif args.command == "update":
            ref = extract_slug(args.slug)
            if _kind_of(ref) == "memory":
                if args.password is not None or args.expires is not None:
                    print(
                        "error: memory items don't support --password/--expires",
                        file=sys.stderr,
                    )
                    return 1
                kwargs: dict = {}
                if args.content is not None:
                    kwargs["content"] = _read_content(args.content)
                update_memory(ref, **kwargs)
            else:
                kwargs = {"token": args.token}
                key = args.key or crypto.extract_key_from_url(args.slug)
                if key is not None:
                    kwargs["key"] = key
                if args.content is not None:
                    kwargs["content"] = _read_content(args.content)
                if args.password is not None:
                    kwargs["password"] = args.password
                if args.expires is not None:
                    kwargs["expires"] = args.expires
                update_share(base_url, ref, **kwargs)
            print(f"updated {ref}")
        elif args.command == "delete":
            ref = extract_slug(args.slug)
            if _kind_of(ref) == "memory":
                delete_memory(ref)
            else:
                delete_share(base_url, ref, token=args.token)
            print(f"deleted {ref}")
    except (ApiError, ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
