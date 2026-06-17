import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getShare, unlockShare } from "../api/client";
import { decrypt, isEncrypted, parseKeyFromHash } from "../lib/crypto";
import MarkdownPreview from "../components/MarkdownPreview";
import ViewQuickActions from "../components/ViewQuickActions";

type Status =
  | "loading"
  | "ready"
  | "locked"
  | "not_found"
  | "expired"
  | "error"
  | "need_key"
  | "decrypt_error";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <section className="card">
      <h1>{title}</h1>
      <p>{body}</p>
      <p>
        <Link to="/">Create a share</Link>
      </p>
    </section>
  );
}

/**
 * Outcome of turning raw API content into renderable markdown.
 * Encrypted envelopes are decrypted with the URL-fragment key; everything
 * else (or a successful decrypt) yields plaintext markdown.
 */
type ResolvedContent =
  | { kind: "ready"; markdown: string }
  | { kind: "need_key" }
  | { kind: "decrypt_error" };

/**
 * Resolve API content for display. Plaintext passes through unchanged; an
 * `arsenc.` envelope is decrypted with the `#k=` fragment key. The key never
 * leaves the URL fragment, so it is never sent to the server.
 */
async function resolveContent(raw: string): Promise<ResolvedContent> {
  if (!isEncrypted(raw)) return { kind: "ready", markdown: raw };

  const key = parseKeyFromHash();
  if (!key) return { kind: "need_key" };

  try {
    return { kind: "ready", markdown: await decrypt(raw, key) };
  } catch {
    return { kind: "decrypt_error" };
  }
}

export default function ViewPage() {
  const { slug = "" } = useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [content, setContent] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getShare(slug)
      .then(async (view) => {
        if (!active) return;
        if (view.has_password && view.content === null) {
          setStatus("locked");
          return;
        }
        const resolved = await resolveContent(view.content ?? "");
        if (!active) return;
        if (resolved.kind === "ready") {
          setContent(resolved.markdown);
          setStatus("ready");
        } else {
          setStatus(resolved.kind);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setStatus("not_found");
        else if (err instanceof ApiError && err.status === 410) setStatus("expired");
        else setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    setUnlockError(null);
    try {
      const unlocked = await unlockShare(slug, password);
      const resolved = await resolveContent(unlocked.content);
      if (resolved.kind === "ready") {
        setContent(resolved.markdown);
        setStatus("ready");
      } else {
        setStatus(resolved.kind);
      }
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed");
    }
  }

  if (status === "loading") return <p className="card">Loading…</p>;
  if (status === "not_found")
    return <Message title="Not found" body="This share does not exist." />;
  if (status === "expired")
    return <Message title="Expired" body="This share has expired." />;
  if (status === "error")
    return (
      <Message title="Something went wrong" body="Could not load this share." />
    );
  if (status === "need_key")
    return (
      <Message
        title="Key missing"
        body="This note is encrypted and the link is missing its key — the part after #."
      />
    );
  if (status === "decrypt_error")
    return (
      <Message
        title="Could not decrypt"
        body="Could not decrypt — the key in this link looks wrong."
      />
    );

  if (status === "locked") {
    return (
      <form className="card" onSubmit={handleUnlock}>
        <h1>Password required</h1>
        <label htmlFor="view-password">Password</label>
        <input
          id="view-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
        />
        {unlockError && (
          <p role="alert" className="error">
            {unlockError}
          </p>
        )}
        <button type="submit">Unlock</button>
      </form>
    );
  }

  return (
    <article className="card">
      <MarkdownPreview content={content ?? ""} />
      <p className="muted">
        <Link to={`/s/${slug}/manage`}>Manage this share</Link>
      </p>
      <ViewQuickActions />
    </article>
  );
}
