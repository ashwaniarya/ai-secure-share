import { useState } from "react";
import SkillCommandDemo from "./SkillCommandDemo";
import { copyToClipboard } from "../lib/clipboard";
import { GITHUB_URL, INSTALL_PROMPT } from "../lib/skill";

const CHIPS = [
  "🛡 XSS-safe",
  "🔒 Optional password",
  "⏱ Auto-expiry",
  "🔗 Rich link previews",
];

/** Landing hero: brand, headline, the rolling skill demo, and the install CTA. */
export default function Hero() {
  const [copied, setCopied] = useState(false);

  async function handleInstall() {
    setCopied(await copyToClipboard(INSTALL_PROMPT));
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
          <span className="hero-kicker">Right from Claude Code.</span>
        </h1>
        <p className="hero-sub">
          The <code>/ai-response-share</code> skill turns any answer into a
          clean, rendered link — without leaving your terminal. Or paste
          markdown below.
        </p>

        <SkillCommandDemo />

        <div className="install-cta">
          <button type="button" className="cta-primary" onClick={handleInstall}>
            {copied ? "Copied — paste into Claude Code" : "Add to Claude Code"}
          </button>
          <a
            className="cta-ghost"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            How it works ↗
          </a>
        </div>

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
