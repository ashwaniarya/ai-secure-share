import { useState } from "react";
import { Link } from "react-router-dom";
import {
  createShare,
  type CreatedShare,
  type CreateShareInput,
} from "../api/client";
import MarkdownPreview from "../components/MarkdownPreview";

const EXPIRY_OPTIONS = [
  { label: "Never", value: "" },
  { label: "1 hour", value: "3600" },
  { label: "1 day", value: "86400" },
  { label: "7 days", value: "604800" },
  { label: "30 days", value: "2592000" },
];

function copyToClipboard(text: string) {
  void navigator.clipboard?.writeText(text);
}

export default function CreatePage() {
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("");
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateShareInput = { content };
      if (password) input.password = password;
      if (expiry) input.expires_in_seconds = Number(expiry);
      setCreated(await createShare(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section className="card">
        <h1>Link created</h1>
        <p>Anyone with this link can read your markdown:</p>
        <a className="share-url" href={created.url}>
          {created.url}
        </a>
        <p className="warning">
          Save your manage token now — it is shown only once and is required to
          edit or delete this share.
        </p>
        <div className="token-row">
          <code>{created.manage_token}</code>
          <button
            type="button"
            onClick={() => copyToClipboard(created.manage_token)}
          >
            Copy token
          </button>
        </div>
        <p>
          <Link to="/">Create another</Link>
        </p>
      </section>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h1>Share markdown</h1>

      <label htmlFor="content">Markdown</label>
      <textarea
        id="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="# Paste your markdown here"
        rows={12}
      />

      <label htmlFor="password">View password (optional)</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="off"
      />

      <label htmlFor="expires">Expires</label>
      <select
        id="expires"
        value={expiry}
        onChange={(e) => setExpiry(e.target.value)}
      >
        {EXPIRY_OPTIONS.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting || !content.trim()}>
        {submitting ? "Creating…" : "Create link"}
      </button>

      <h2>Preview</h2>
      <MarkdownPreview content={content} />
    </form>
  );
}
