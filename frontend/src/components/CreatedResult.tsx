import type { CreatedShare } from "../api/client";
import Masthead from "./Masthead";
import { copyToClipboard } from "../lib/clipboard";
import { toAbsoluteUrl } from "../lib/url";

interface CreatedResultProps {
  share: CreatedShare;
  onCreateAnother: () => void;
}

/** Handoff screen: the link, and the one-time token that can never be reissued. */
export default function CreatedResult({
  share,
  onCreateAnother,
}: CreatedResultProps) {
  // Force an absolute URL: a scheme-less server URL would render as a relative
  // href and resolve to the duplicated-domain link (host/host/s/<slug>).
  const shareUrl = toAbsoluteUrl(share.url);

  return (
    <section className="sheet result-card">
      <Masthead meta="saved" />
      <div className="sheet-body">
        <span className="stamp">record created</span>
        <h1 className="result-title">Your link is ready.</h1>
        <p className="muted hint">Anyone with this link can read your markdown.</p>

        <a className="share-url" href={shareUrl}>
          {shareUrl}
        </a>

        <p className="warning">manage token — shown once</p>
        <div className="token-row">
          <code>{share.manage_token}</code>
          <button
            type="button"
            onClick={() => copyToClipboard(share.manage_token)}
          >
            Copy token
          </button>
        </div>
        <p className="muted hint">
          Store it now. It is the only way to edit or delete this share, and it
          is never recoverable.
        </p>

        <div className="result-actions">
          <button
            type="button"
            className="cta-primary"
            onClick={() => copyToClipboard(shareUrl)}
          >
            Copy link
          </button>
          <a
            className="cta-ghost"
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open link
          </a>
          <button type="button" className="cta-ghost" onClick={onCreateAnother}>
            Create another
          </button>
        </div>
      </div>
    </section>
  );
}
