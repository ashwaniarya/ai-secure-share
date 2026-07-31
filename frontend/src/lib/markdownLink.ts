/** Builds a paste-ready markdown link for a share, titled from its content. */

const FALLBACK_TITLE = "Shared AI response";
const MAX_TITLE_LENGTH = 80;
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Picks the human title for a share: its first heading, else its first line of
 * prose. Lines inside fenced code blocks are skipped, so a `# install deps`
 * shell comment in an opening code block is not mistaken for a heading.
 */
export function deriveLinkTitle(content: string): string {
  const lines = content.split("\n");
  let insideFence = false;
  let firstProseLine = "";

  for (const line of lines) {
    if (FENCE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const heading = line.match(HEADING);
    if (heading) return finalize(heading[1]);
    if (!firstProseLine && line.trim()) firstProseLine = line.trim();
  }

  return finalize(firstProseLine || FALLBACK_TITLE);
}

export function buildMarkdownLink(content: string, url: string): string {
  return `[${deriveLinkTitle(content)}](${url})`;
}

/** Truncates to a sane length, then escapes what would break link syntax. */
function finalize(title: string): string {
  const trimmed = title.trim();
  const shortened =
    trimmed.length > MAX_TITLE_LENGTH
      ? trimmed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd() + "…"
      : trimmed;
  return shortened.replace(/([[\]])/g, "\\$1");
}
