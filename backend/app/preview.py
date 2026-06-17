"""Open Graph preview rendering for shared notes.

Search-engine and chat crawlers (Slack's ``Slackbot-LinkExpanding``, Discord,
iMessage, Twitter, ...) do not execute JavaScript, so the SPA shell carries no
per-share metadata. These helpers derive a title + description from a note's
markdown and produce the ``<head>`` tags that the ``/s/{slug}`` route injects.

Two invariants:
- All interpolated values are HTML-escaped — note content is untrusted, so
  unescaped text could break out of the shell (stored XSS / markup injection).
- Protected content is never summarised: password-protected, expired, and
  missing notes get generic copy, never an excerpt.
"""

from __future__ import annotations

import html
import re

SITE_NAME = "AI Response Share"
SITE_TAGLINE = "End-to-end encrypted markdown sharing."
DEFAULT_TITLE = "Shared note"

_HEADING_PREFIX = re.compile(r"^\s{0,3}#{1,6}\s*")
_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_LIST_MARKER = re.compile(r"^\s*([-*+]|\d+\.)\s+", re.MULTILINE)
_MD_TOKENS = re.compile(r"[*_`~>#]+")
_OG_MARKERS = re.compile(r"<!--OG:START-->.*?<!--OG:END-->", re.DOTALL)


def extract_title(content: str, fallback: str = DEFAULT_TITLE, limit: int = 120) -> str:
    """First non-empty line (heading markers stripped), capped to ``limit`` chars."""
    for line in content.splitlines():
        stripped = _HEADING_PREFIX.sub("", line).strip()
        if stripped:
            return stripped[:limit]
    return fallback


def _strip_markdown(text: str) -> str:
    text = _MD_IMAGE.sub("", text)
    text = _MD_LINK.sub(r"\1", text)
    text = _LIST_MARKER.sub("", text)
    text = _MD_TOKENS.sub("", text)
    return text


def summarize(content: str, limit: int = 200) -> str:
    """Plain-text excerpt of the markdown, collapsed and truncated with an ellipsis."""
    text = " ".join(_strip_markdown(content).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def og_block(
    *,
    title: str,
    description: str,
    url: str,
    image: str | None = None,
    site_name: str = SITE_NAME,
) -> str:
    """Render the ``<head>`` meta tags. Every value is HTML-escaped."""

    def esc(value: str) -> str:
        return html.escape(value, quote=True)

    card = "summary_large_image" if image else "summary"
    tags = [
        '<meta property="og:type" content="article" />',
        f'<meta property="og:site_name" content="{esc(site_name)}" />',
        f'<meta property="og:title" content="{esc(title)}" />',
        f'<meta property="og:description" content="{esc(description)}" />',
        f'<meta property="og:url" content="{esc(url)}" />',
        f'<meta name="twitter:card" content="{card}" />',
        f'<meta name="twitter:title" content="{esc(title)}" />',
        f'<meta name="twitter:description" content="{esc(description)}" />',
        f'<meta name="description" content="{esc(description)}" />',
        f"<title>{esc(title)}</title>",
    ]
    if image:
        tags.insert(5, f'<meta property="og:image" content="{esc(image)}" />')
        tags.append(f'<meta name="twitter:image" content="{esc(image)}" />')
    return "\n".join(tags)


def inject_og(html_text: str, block: str) -> str:
    """Swap the ``<!--OG:START-->..<!--OG:END-->`` block; else insert after <head>."""
    if _OG_MARKERS.search(html_text):
        return _OG_MARKERS.sub(lambda _match: block, html_text, count=1)
    lowered = html_text.lower()
    head = lowered.find("<head>")
    if head != -1:
        cut = head + len("<head>")
        return f"{html_text[:cut]}\n{block}{html_text[cut:]}"
    return block + html_text


def share_meta(share, *, expired: bool) -> tuple[str, str]:
    """(title, description) for a note's preview — never leaks protected content.

    ``share`` is a ``Share`` ORM row or ``None`` (unknown slug).
    """
    if share is None:
        return SITE_NAME, SITE_TAGLINE
    if expired:
        return "Expired note", "This shared note has expired."
    if share.password_hash is not None:
        return "Password-protected note", "Open the link to enter the password."
    if share.content.startswith("arsenc."):
        return "Encrypted note", "This note is end-to-end encrypted — open the link to view."
    return extract_title(share.content), summarize(share.content)
