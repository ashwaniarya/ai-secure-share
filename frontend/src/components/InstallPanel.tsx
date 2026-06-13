import { useState } from "react";
import { copyToClipboard } from "../lib/clipboard";
import { GITHUB_URL, INSTALL_PROMPT } from "../lib/skill";

/** Revealed under the composer — the copy-paste prompt to add the skill to an agent. */
export default function InstallPanel() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    setCopied(await copyToClipboard(INSTALL_PROMPT));
  }

  return (
    <section className="install-panel">
      <h3 className="install-panel-title">Add it to your agent</h3>
      <pre className="install-prompt">{INSTALL_PROMPT}</pre>
      <div className="install-panel-actions">
        <button type="button" className="cta-primary" onClick={handleCopy}>
          {copied ? "Copied ✓" : "Copy install prompt"}
        </button>
        <a className="cta-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
          Cursor / Codex / Copilot CLI — run via the CLI →
        </a>
      </div>
    </section>
  );
}
