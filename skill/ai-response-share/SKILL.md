---
name: ai-response-share
description: Use when the user wants to save, share, store, persist, remember, or recall AI responses or any markdown — "share this", "save the current response", "save the last answer", "make a shareable link", "turn this into a link", "get a link", "export this", "keep this", "remember this", "save to memory", "read this link", "open this link", "what's in this link", "load that share", "fetch link", "recall what I saved", "recall saved", "list my shares", "list saved", "show saved items", "update saved", "edit share", "delete share", "remove saved" — or any close paraphrase of saving content for later or fetching something saved/shared earlier.
---

# ai-response-share

Save markdown (AI responses or anything) as public share links, keep local
memory items, and recall anything saved later. Everything goes through the
stdlib-only CLI in this skill's directory:

```
python <this-skill-dir>/scripts/share.py <command>
```

The API base URL defaults to the hosted service `https://airesponseshare.com` —
no configuration needed. Set `$AI_RESPONSE_SHARE_URL` (or pass `--url`) only
for local dev or self-hosting, e.g. `AI_RESPONSE_SHARE_URL=http://localhost:8000`.
Run any command with `--help` for all flags.

## Intent → command

| User intent | Command |
|---|---|
| save / share / store / persist / remember / keep / export content | `create --content <md\|file\|->` → public link |
| …with explicit "no link" / "local only" / "don't publish" | `remember --content <md\|file\|->` (local, no network) |
| open / read a link, slug, or saved item | `read <url-or-slug-or-id>` |
| what have I saved? | `list` |
| recall a saved item by topic | `recall "<id or title fragment>"` |
| edit a saved item | `update <url-or-slug-or-id> --content <md\|file\|->` |
| remove a saved item | `delete <url-or-slug-or-id>` |

No operation is gated — every command is always available.

## Save rule (deterministic — no judgment calls)

- EVERY save intent (save / share / store / persist / remember / keep / export)
  → `create` → **always put the view URL in your reply**.
- Use `remember` ONLY when the user explicitly opts out of a link with wording
  like "no link", "no public link", "local only", "don't publish", "don't
  upload". "Remember this" without such wording = `create` (public link; it is
  still indexed and recallable).
- Never ask which mode to use; the user's wording decides.
- Direct-action phrasing ("create current response into a shareable link") =
  run it immediately, no questions.
- Defaults: never expires, no password, title auto-derived from the first
  heading. Apply them silently; you may mention `--expires/--password/--title`
  as adjustable in one short aside, never as a blocking question.

## Reads

- Pass whatever the user gave — full URL, schemeless URL, bare slug, or memory
  id — straight to `read`. Do NOT extract the slug yourself.
- Public shares need no token. Password-protected: re-run with `--password`
  (ask the user for it if unknown).

## Recall and listing

- `recall` exit 0 → it printed the content; display it.
- `recall` exit 2 → several matches were listed on stderr; ask the user ONE
  short question offering those options.
- `recall` exit 1 → nothing matched; say so and offer `list`.
- `list` shows everything saved (kind, id, date, title, link/path), newest
  first. Present it back to the user as a compact table with columns
  **kind · id · date · title · link**.
- Shares created before the index existed appear untitled, but `list` still
  prints a constructed `…/s/<slug>` link for them — show that link and note it
  opens with `read <slug>`.

## Ambiguity (ask only when genuinely needed)

Act immediately when intent is clear. Ask at most 1–2 short questions with
selectable options ONLY when the target truly can't be determined — e.g. two
earlier responses both plausibly match "save the deployment answer", "this"
has no referent, or `recall` exited 2. Never ask about settings that have
defaults.

## Editing and tokens

- Shares created here: the manage token was cached at creation —
  `update`/`delete` just work.
- A share created elsewhere: ask the user once for its manage token and pass
  `--token`; on success it is cached, so future edits need no token.
- Memory items need no token; `update`/`delete` accept their id directly.

## Output style

- Save: the link plainly on its own line + one line confirming what was saved
  (mention the manage token is shown once).
- Read / recall: display the content.
- List: a compact table (kind · id · date · title · link), newest first.
- Memory, update, delete: one concise confirmation line.

## Local store

`$AI_RESPONSE_SHARE_HOME` (default `~/.ai-response-share`) holds `tokens.json`
(manage tokens), `index.json` (titles/dates for recall), and `memory/*.md`
(local-only items).

## Install

```
ln -s "$(pwd)/skill/ai-response-share" ~/.claude/skills/ai-response-share
```

## Tests

```
backend/.venv/bin/python -m pytest skill/ai-response-share/tests
```
