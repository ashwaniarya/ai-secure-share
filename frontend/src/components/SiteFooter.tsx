import { GITHUB_URL } from "../lib/skill";

/** Slim landing footer. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href={GITHUB_URL} target="_blank" rel="noreferrer">
        Open source on GitHub
      </a>
      <a href="#create">How it works</a>
      <span>Built with Claude Code</span>
    </footer>
  );
}
