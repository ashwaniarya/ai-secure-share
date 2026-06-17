import { useState } from "react";
import AgentComposerDemo from "./AgentComposerDemo";
import InstallPanel from "./InstallPanel";
import { copyToClipboard } from "../lib/clipboard";
import { AGENTS, GITHUB_URL, INSTALL_PROMPT } from "../lib/skill";

const CHIPS = [
  "🔐 End-to-end encrypted",
  "🛡 XSS-safe",
  "🔒 Optional password",
  "⏱ Auto-expiry",
  "🔗 Rich link previews",
];

/** Landing hero: brand, agent-first headline, the composer, and the install panel. */
export default function Hero() {
  const [showInstall, setShowInstall] = useState(false);

  async function revealInstall() {
    setShowInstall(true);
    await copyToClipboard(INSTALL_PROMPT);
  }

  return (
    <>
      <nav className="home-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          ai-response-share
        </span>
        <div className="home-nav-links">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="#create">Paste markdown</a>
        </div>
      </nav>

      <div className="hero">
        <h1 className="hero-title">
          Turn any AI response into a{" "}
          <span className="hero-accent">shareable link</span>.
          <span className="hero-kicker">From your AI agent.</span>
        </h1>
        <p className="hero-sub">
          Ask your AI agent to share any answer — get a clean, rendered link
          back. First-class in Claude Code, or from any agent via the CLI.
          Prefer the web? Paste below.
        </p>

        <AgentComposerDemo onSend={revealInstall} />

        {showInstall && <InstallPanel />}

        <div className="install-cta">
          <button type="button" className="cta-primary" onClick={revealInstall}>
            Add to Claude Code
          </button>
          <a
            className="cta-ghost"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            Using another agent? →
          </a>
        </div>

        <p className="agents-row">
          <span className="agents-label">Works in</span>
          {AGENTS.map((agent, index) => (
            <span
              key={agent}
              className={`agent${index === 0 ? " agent-primary" : ""}`}
            >
              {agent}
            </span>
          ))}
          <span className="agent agent-muted">+ any agent via CLI</span>
        </p>

        <ul className="chips">
          {CHIPS.map((chip) => (
            <li className="chip" key={chip}>
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
