---
name: ai-response-share
description: Create, read, update, and delete shareable markdown links via the AI Response Share API. Use when the user wants to share markdown through a link, "create a share", "make a shareable markdown link", "paste this as a link", or read/update/delete an existing share by its slug.
---

# ai-response-share

Manage AI Response Share markdown shares from the command line. The helper is
stdlib-only (`scripts/share.py`) and talks to the deployed HTTP API.

## Configuration

- `AI_RESPONSE_SHARE_URL` — API base URL (default `http://localhost:8000`). Set
  this to your Railway URL in production.
- Manage tokens are cached in `~/.ai-response-share/tokens.json` (override with
  `AI_RESPONSE_SHARE_HOME`) so `update`/`delete` work without re-supplying the
  token. Pass `--token` to override.

## Commands

Run with `python scripts/share.py <command>`.

### create
```
python scripts/share.py create --content "# Title\n\nbody"
python scripts/share.py create --content notes.md --expires 7d --password hunter2
python scripts/share.py create --content -          # read markdown from stdin
```
`--content` accepts literal markdown, a file path, or `-` for stdin.
`--expires` is one of `never` (default), `1h`, `1d`, `7d`, `30d`, or a number of
seconds. Prints the slug, view URL, and the **manage token (shown once)**.

### read
```
python scripts/share.py read <slug>
python scripts/share.py read <slug> --password hunter2
```
Prints the markdown content. Supply `--password` for password-protected shares.

### update
```
python scripts/share.py update <slug> --content updated.md
python scripts/share.py update <slug> --expires never
python scripts/share.py update <slug> --password newpass --token <manage_token>
```
Only the flags you pass are changed. Uses the cached manage token unless
`--token` is given.

### delete
```
python scripts/share.py delete <slug>
```
Deletes the share (cached or `--token` manage token required).

## Install

Copy or symlink this directory into a skills location so it is auto-discovered:
```
ln -s "$(pwd)/skill/ai-response-share" ~/.claude/skills/ai-response-share
```

## Tests

```
backend/.venv/bin/python -m pytest skill/ai-response-share/tests
```
Unit tests cover expiry parsing and the token store; an integration test spins
up the real API and exercises a full create → read → update → delete round-trip.
