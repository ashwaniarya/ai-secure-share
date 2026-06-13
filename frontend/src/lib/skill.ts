/** Shared copy + constants for the ai-response-share skill, surfaced on the landing page. */

export const GITHUB_URL = "https://github.com/ashwaniarya/ai-secure-share";

/** Copy-paste prompt that installs the skill into Claude Code (mirrors the README). */
export const INSTALL_PROMPT = `Install the ai-response-share Claude Code skill:
1. Clone ${GITHUB_URL} (skip if I already have it locally).
2. Symlink its skill/ai-response-share directory to ~/.claude/skills/ai-response-share.
3. Verify the install with a create → read → delete round trip using
   skill/ai-response-share/scripts/share.py, and show me the share URL it created.`;

/** Rotating hero examples — deliberately a mix of developer and non-developer tasks. */
export const SKILL_EXAMPLES = [
  "create a shareable plan to send to my boss",
  "share this API design with the team",
  "turn these meeting notes into a link",
  "save this recipe and send mom the link",
  "publish my study guide",
  "share this bug report",
];
