import { useState } from "react";
import AgentComposerDemo from "./AgentComposerDemo";
import InstallPanel from "./InstallPanel";
import Masthead from "./Masthead";
import ProvenanceRail from "./ProvenanceRail";
import ShareCounter from "./ShareCounter";
import { copyToClipboard } from "../lib/clipboard";
import { AGENTS, GITHUB_URL, INSTALL_PROMPT } from "../lib/skill";

const CHIPS = [
  "unfurls in slack",
  "code · tables · diagrams",
  "end-to-end encrypted",
  "password + expiry",
  "no accounts",
];

/** Landing hero: the record's masthead, its reach, and the agent-first pitch. */
export default function Hero() {
  const [showInstall, setShowInstall] = useState(false);

  async function revealInstall() {
    setShowInstall(true);
    await copyToClipboard(INSTALL_PROMPT);
  }

  return (
    <div className="sheet">
      <Masthead meta="encrypted · no accounts · open source" />
      <div className="sheet-grid">
        <ProvenanceRail entries={[{ label: "agents", values: AGENTS }]}>
          <ShareCounter />
        </ProvenanceRail>

        <div className="sheet-body">
          <span className="stamp">provenance included</span>
          <h1 className="hero-title">
            Your AI does the work.{" "}
            <span className="hero-accent">Now your whole team can see it.</span>
            <span className="hero-kicker">From the agents they already use</span>
          </h1>
          <p className="hero-sub">
            Plans, designs, specs, postmortems — every answer becomes a rendered
            link that carries where it came from, who can open it, and when it
            expires.
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
              Roll it out to your team
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
      </div>
    </div>
  );
}
