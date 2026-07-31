import { useEffect, useState } from "react";
import {
  createShare,
  type CreatedShare,
  type CreateShareInput,
} from "../api/client";
import { encrypt, generateKey, keyToB64url } from "../lib/crypto";
import CreatedResult from "../components/CreatedResult";
import Hero from "../components/Hero";
import MarkdownPreview from "../components/MarkdownPreview";
import SiteFooter from "../components/SiteFooter";

const EXPIRY_OPTIONS = [
  { label: "Never", value: "" },
  { label: "1 hour", value: "3600" },
  { label: "1 day", value: "86400" },
  { label: "7 days", value: "604800" },
  { label: "30 days", value: "2592000" },
];

export default function CreatePage() {
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("");
  const [encryptEnabled, setEncryptEnabled] = useState(true);
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Widen + theme the shared .app container for the landing route only.
  useEffect(() => {
    document.body.classList.add("home");
    return () => document.body.classList.remove("home");
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Encrypt in the browser when enabled (default). The 256-bit key goes in
      // the URL fragment so it never reaches the server; the server stores only
      // the `arsenc.` ciphertext envelope.
      let payload = content;
      let keyFragment = "";
      if (encryptEnabled) {
        const key = generateKey();
        payload = await encrypt(content, key);
        keyFragment = "#k=" + keyToB64url(key);
      }

      const input: CreateShareInput = { content: payload };
      if (password) input.password = password;
      if (expiry) input.expires_in_seconds = Number(expiry);

      const result = await createShare(input);
      // Fold the key fragment into the shown/copied link so the recipient can
      // decrypt; for plaintext shares keyFragment is empty.
      setCreated({ ...result, url: result.url + keyFragment });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setContent("");
    setPassword("");
    setExpiry("");
    setError(null);
  }

  return (
    <div className="home">
      {created ? (
        <CreatedResult share={created} onCreateAnother={resetForm} />
      ) : (
        <>
          <Hero />
          <section className="create-tool" id="create">
            <div className="tool-divider">or paste markdown</div>
            <form className="sheet sheet-body" onSubmit={handleSubmit}>
              <div className="tool-grid">
                <div className="tool-editor">
                  <label htmlFor="content">Markdown</label>
                  <textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="# Paste your markdown here"
                    rows={14}
                  />
                  <div className="tool-options">
                    <div>
                      <label htmlFor="password">View password (optional)</label>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div>
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
                    </div>
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={encryptEnabled}
                      onChange={(e) => setEncryptEnabled(e.target.checked)}
                    />
                    End-to-end encrypt
                  </label>
                  <p className="muted hint">
                    {encryptEnabled
                      ? "Encrypted in your browser with AES-256-GCM before upload. The key goes in the link after the # and is never sent to us — the server stores only ciphertext. Anyone you give the full link to can read it."
                      : "Off: uploaded as plaintext — the server can read it and link previews show a snippet. Anyone with the link can read it."}
                  </p>
                  {error && (
                    <p role="alert" className="error">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="cta-primary"
                    disabled={submitting || !content.trim()}
                  >
                    {submitting ? "Creating…" : "Create link"}
                  </button>
                </div>
                <div className="tool-preview">
                  <span className="tool-section-label">Preview</span>
                  <MarkdownPreview content={content} />
                </div>
              </div>
            </form>
          </section>
        </>
      )}
      <SiteFooter />
    </div>
  );
}
