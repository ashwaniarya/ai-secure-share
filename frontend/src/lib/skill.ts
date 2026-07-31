/** Shared copy + constants for the ai-response-share skill, surfaced on the landing page. */

export const GITHUB_URL = "https://github.com/ashwaniarya/ai-secure-share";

/** Copy-paste prompt that installs the skill into Claude Code (mirrors the README). */
export const INSTALL_PROMPT = `Install the ai-response-share Claude Code skill:
1. Clone ${GITHUB_URL} (skip if I already have it locally).
2. Symlink its skill/ai-response-share directory to ~/.claude/skills/ai-response-share.
3. Verify the install with a create → read → delete round trip using
   skill/ai-response-share/scripts/share.py, and show me the share URL it created.`;

/** Rotating hero examples — the work a team actually hands off in a week. */
export const SKILL_EXAMPLES = [
  "share this API design with the team",
  "turn this postmortem into a link",
  "send the sprint plan to my PM",
  "publish these architecture docs",
  "share this bug analysis with on-call",
];

/**
 * Agents the skill works with. Claude Code is the first-class integration (the
 * packaged skill); the rest run the agent-agnostic share.py CLI.
 */
export const AGENTS: [string, ...string[]] = [
  "Claude Code",
  "Cursor",
  "Codex",
  "Copilot CLI",
  "Cline",
];
