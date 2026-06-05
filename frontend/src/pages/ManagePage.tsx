import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  deleteShare,
  getShare,
  updateShare,
  type UpdateShareInput,
} from "../api/client";

const EXPIRY_OPTIONS = [
  { label: "Keep current", value: "keep" },
  { label: "Never", value: "" },
  { label: "1 hour", value: "3600" },
  { label: "1 day", value: "86400" },
  { label: "7 days", value: "604800" },
  { label: "30 days", value: "2592000" },
];

export default function ManagePage() {
  const { slug = "" } = useParams();
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState("");
  const [expiry, setExpiry] = useState("keep");
  const [newPassword, setNewPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function handleLoad(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const view = await getShare(slug, token);
      setContent(view.content ?? "");
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load share");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const patch: UpdateShareInput = { content };
    if (removePassword) patch.password = null;
    else if (newPassword) patch.password = newPassword;
    if (expiry !== "keep") patch.expires_in_seconds = expiry ? Number(expiry) : null;
    try {
      await updateShare(slug, token, patch);
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await deleteShare(slug, token);
      setDeleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (deleted) {
    return (
      <section className="card">
        <h1>Deleted</h1>
        <p>This share has been deleted.</p>
        <p>
          <Link to="/">Create a new share</Link>
        </p>
      </section>
    );
  }

  if (!loaded) {
    return (
      <form className="card" onSubmit={handleLoad}>
        <h1>Manage share</h1>
        <label htmlFor="manage-token">Manage token</label>
        <input
          id="manage-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={!token}>
          Load
        </button>
      </form>
    );
  }

  return (
    <form className="card" onSubmit={handleSave}>
      <h1>Edit share</h1>

      <label htmlFor="manage-content">Markdown</label>
      <textarea
        id="manage-content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={12}
      />

      <label htmlFor="manage-password">New view password</label>
      <input
        id="manage-password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        disabled={removePassword}
        autoComplete="off"
      />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={removePassword}
          onChange={(e) => setRemovePassword(e.target.checked)}
        />
        Remove password
      </label>

      <label htmlFor="manage-expires">Expiry</label>
      <select
        id="manage-expires"
        value={expiry}
        onChange={(e) => setExpiry(e.target.value)}
      >
        {EXPIRY_OPTIONS.map((option) => (
          <option key={option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {message && <p className="success">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="submit">Save changes</button>
        {confirmingDelete ? (
          <>
            <button
              type="button"
              className="danger"
              onClick={handleDelete}
            >
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="danger"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
