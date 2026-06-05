import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getShare, unlockShare } from "../api/client";
import MarkdownPreview from "../components/MarkdownPreview";

type Status =
  | "loading"
  | "ready"
  | "locked"
  | "not_found"
  | "expired"
  | "error";

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

export default function ViewPage() {
  const { slug = "" } = useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [content, setContent] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getShare(slug)
      .then((view) => {
        if (!active) return;
        if (view.has_password && view.content === null) {
          setStatus("locked");
        } else {
          setContent(view.content);
          setStatus("ready");
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
      setContent(unlocked.content);
      setStatus("ready");
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
    </article>
  );
}
