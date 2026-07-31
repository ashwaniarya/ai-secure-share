import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  deleteShare,
  getShare,
  updateShare,
  type UpdateShareInput,
} from "../api/client";
import {
  b64urlToBytes,
  decrypt,
  encrypt,
  isEncrypted,
  parseKeyFromHash,
} from "../lib/crypto";
import Masthead from "../components/Masthead";

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
  // When the loaded share is an `arsenc.` envelope, this holds the key used to
  // decrypt it so we can re-encrypt edits under the SAME key on save. Null for
  // plaintext shares. Sourced from the URL fragment or a pasted key.
  const [encryptionKey, setEncryptionKey] = useState<Uint8Array | null>(null);
  // The raw encrypted envelope is held while we wait for the user to paste the
  // key (the `#k=` fragment was missing from the manage URL).
  const [pendingEnvelope, setPendingEnvelope] = useState<string | null>(null);
  const [pastedKey, setPastedKey] = useState("");

  /** Decrypt `envelope` with `key` into the editable textarea, or surface an error. */
  async function applyDecryptedContent(envelope: string, key: Uint8Array) {
    const plaintext = await decrypt(envelope, key);
    setContent(plaintext);
    setEncryptionKey(key);
    setPendingEnvelope(null);
    setLoaded(true);
  }

  async function handleLoad(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const view = await getShare(slug, token);
      const raw = view.content ?? "";

      if (!isEncrypted(raw)) {
        setContent(raw);
        setEncryptionKey(null);
        setLoaded(true);
        return;
      }

      const key = parseKeyFromHash();
      if (!key) {
        // Encrypted, but the manage URL has no `#k=` key — ask the user to paste it.
        setPendingEnvelope(raw);
        setLoaded(true);
        return;
      }

      try {
        await applyDecryptedContent(raw, key);
      } catch {
        setError("Could not decrypt — the key in this link looks wrong.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load share");
    }
  }

  async function handleApplyPastedKey(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!pendingEnvelope) return;
    let key: Uint8Array;
    try {
      key = b64urlToBytes(pastedKey.trim());
    } catch {
      setError("That key is not valid — paste the part after #k=.");
      return;
    }
    try {
      await applyDecryptedContent(pendingEnvelope, key);
    } catch {
      setError("Could not decrypt — that key looks wrong.");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      // Re-encrypt under the original key so the existing `#k=` link still works.
      const payload = encryptionKey
        ? await encrypt(content, encryptionKey)
        : content;
      const patch: UpdateShareInput = { content: payload };
      if (removePassword) patch.password = null;
      else if (newPassword) patch.password = newPassword;
      if (expiry !== "keep") patch.expires_in_seconds = expiry ? Number(expiry) : null;
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
      <section className="sheet">
        <Masthead meta="deleted" />
        <div className="sheet-body">
          <span className="stamp">record removed</span>
          <h1>Deleted.</h1>
          <p className="muted">This share has been deleted.</p>
          <p>
            <Link to="/">Create a new share</Link>
          </p>
        </div>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section className="sheet">
        <Masthead meta={`/s/${slug}/manage`} />
        <form className="sheet-body" onSubmit={handleLoad}>
          <span className="stamp">authorization required</span>
          <h1>Manage share.</h1>
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
          <div className="actions">
            <button type="submit" className="cta-primary" disabled={!token}>
              Load
            </button>
          </div>
        </form>
      </section>
    );
  }

  if (pendingEnvelope) {
    return (
      <section className="sheet">
        <Masthead meta={`/s/${slug}/manage`} />
        <form className="sheet-body" onSubmit={handleApplyPastedKey}>
          <span className="stamp">key required</span>
          <h1>Encryption key needed.</h1>
          <p className="muted hint">
            This share is end-to-end encrypted, but this link is missing its key
            — the part after <code>#k=</code>. Paste that key to edit the
            content.
          </p>
          <label htmlFor="manage-key">Encryption key</label>
          <input
            id="manage-key"
            type="text"
            value={pastedKey}
            onChange={(e) => setPastedKey(e.target.value)}
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              type="submit"
              className="cta-primary"
              disabled={!pastedKey.trim()}
            >
              Unlock for editing
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="sheet">
      <Masthead meta={`/s/${slug}/manage`} />
      <form className="sheet-body" onSubmit={handleSave}>
      <span className="stamp">editing record</span>
      <h1>Edit share.</h1>

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
        <button type="submit" className="cta-primary">
          Save changes
        </button>
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
    </section>
  );
}
