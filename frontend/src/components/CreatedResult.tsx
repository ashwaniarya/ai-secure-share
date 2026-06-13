import type { CreatedShare } from "../api/client";
import { copyToClipboard } from "../lib/clipboard";

interface CreatedResultProps {
  share: CreatedShare;
  onCreateAnother: () => void;
}

/** Celebratory success screen shown after a share is created. */
export default function CreatedResult({
  share,
  onCreateAnother,
}: CreatedResultProps) {
  return (
    <section className="card result-card">
      <div className="result-emoji" aria-hidden="true">
        ✨
      </div>
      <h1 className="result-title">Your link is ready</h1>
      <p className="muted">Anyone with this link can read your markdown:</p>

      <a className="share-url" href={share.url}>
        {share.url}
      </a>
      <div className="result-actions">
        <button
          type="button"
          className="cta-primary"
          onClick={() => copyToClipboard(share.url)}
        >
          Copy link
        </button>
        <a
          className="cta-ghost"
          href={share.url}
          target="_blank"
          rel="noreferrer"
        >
          Open link ↗
        </a>
      </div>

      <p className="warning">
        Save your manage token now — it is shown only once and is required to
        edit or delete this share.
      </p>
      <div className="token-row">
        <code>{share.manage_token}</code>
        <button type="button" onClick={() => copyToClipboard(share.manage_token)}>
          Copy token
        </button>
      </div>

      <p>
        <button type="button" className="cta-ghost" onClick={onCreateAnother}>
          ← Create another
        </button>
      </p>
    </section>
  );
}
