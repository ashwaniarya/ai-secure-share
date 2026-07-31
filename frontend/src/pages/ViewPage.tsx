import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getShare, unlockShare, type ShareView } from "../api/client";
import { decrypt, isEncrypted, parseKeyFromHash } from "../lib/crypto";
import MarkdownPreview from "../components/MarkdownPreview";
import Masthead from "../components/Masthead";
import ProvenanceRail, { type RailEntry } from "../components/ProvenanceRail";
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

// created_at/expires_at/has_password come from the record; `encrypted` is
// derived client-side from the payload, and is re-derived after an unlock.
interface Provenance {
  created_at: string;
  expires_at: string | null;
  has_password: boolean;
  encrypted: boolean;
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <section className="sheet">
      <Masthead />
      <div className="sheet-body">
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        <p>
          <Link to="/">Create a share</Link>
        </p>
      </div>
    </section>
  );
}

const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * The backend stores naive UTC (models.py strips tzinfo), so timestamps arrive
 * with no offset and would otherwise be read as local time. Dates are rendered
 * in UTC and labelled: the rail is a record of what happened, so two people in
 * different timezones must not read different dates off the same share.
 */
function formatDate(value: string): string {
  const parsed = new Date(HAS_TIMEZONE.test(value) ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return `${parsed.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  })} UTC`;
}

function railEntries(provenance: Provenance): RailEntry[] {
  return [
    { label: "created", values: [formatDate(provenance.created_at)] },
    {
      label: "expires",
      values: [
        provenance.expires_at ? formatDate(provenance.expires_at) : "Never",
      ],
    },
    {
      label: "access",
      values: [provenance.has_password ? "Password" : "Public link"],
    },
    {
      label: "cipher",
      values: [provenance.encrypted ? "AES-256-GCM" : "Plaintext"],
    },
  ];
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

function toProvenance(view: ShareView, raw: string): Provenance {
  return {
    created_at: view.created_at,
    expires_at: view.expires_at,
    has_password: view.has_password,
    encrypted: isEncrypted(raw),
  };
}

export default function ViewPage() {
  const { slug = "" } = useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [content, setContent] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // The route reuses this component across /s/A -> /s/B, so without an
    // explicit reset the previous share's content and provenance stay on
    // screen under the new slug while the fetch is in flight.
    setStatus("loading");
    setContent(null);
    setProvenance(null);
    setPassword("");
    setUnlockError(null);
    getShare(slug)
      .then(async (view) => {
        if (!active) return;
        const raw = view.content ?? "";
        setProvenance(toProvenance(view, raw));
        if (view.has_password && view.content === null) {
          setStatus("locked");
          return;
        }
        const resolved = await resolveContent(raw);
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
      setProvenance((prev) =>
        prev ? { ...prev, encrypted: isEncrypted(unlocked.content) } : prev,
      );
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

  if (status === "loading")
    return (
      <section className="sheet">
        <Masthead meta={`/s/${slug}`} />
        <div className="sheet-body">
          <p className="muted">Loading…</p>
        </div>
      </section>
    );
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
      <section className="sheet">
        <Masthead meta={`/s/${slug}`} />
        <form className="sheet-body" onSubmit={handleUnlock}>
          <span className="stamp">password required</span>
          <h1>This share is locked.</h1>
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
          <div className="actions">
            <button type="submit" className="cta-primary">
              Unlock
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <article className="sheet">
      <Masthead meta={`/s/${slug}`} />
      <div className="sheet-grid">
        {provenance && <ProvenanceRail entries={railEntries(provenance)} />}
        <div className="sheet-body">
          <MarkdownPreview content={content ?? ""} />
          <p className="muted">
            <Link to={`/s/${slug}/manage`}>Manage this share</Link>
          </p>
        </div>
      </div>
      <ViewQuickActions />
    </article>
  );
}
