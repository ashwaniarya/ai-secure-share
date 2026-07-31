import { describe, expect, test } from "vitest";
import { buildMarkdownLink, deriveLinkTitle } from "../markdownLink";

const URL = "https://airesponseshare.com/s/aB3x9";

describe("deriveLinkTitle", () => {
  test("uses the first ATX heading", () => {
    expect(deriveLinkTitle("# API design review\n\nBody text")).toBe(
      "API design review",
    );
  });

  test("uses a deeper heading when that is what the document opens with", () => {
    expect(deriveLinkTitle("### Postmortem: cache stampede\n")).toBe(
      "Postmortem: cache stampede",
    );
  });

  test("prefers a heading that appears after body text", () => {
    expect(deriveLinkTitle("intro paragraph\n\n# The real title\n")).toBe(
      "The real title",
    );
  });

  test("falls back to the first non-empty line when there is no heading", () => {
    expect(deriveLinkTitle("\n\nsprint plan for next week\nmore text")).toBe(
      "sprint plan for next week",
    );
  });

  test.each(["", "   ", "\n\n\t\n"])(
    "falls back to a generic title for blank content (%j)",
    (content) => {
      expect(deriveLinkTitle(content)).toBe("Shared AI response");
    },
  );

  // Unescaped brackets terminate the link text early, so the pasted markdown
  // would render as broken syntax rather than a link.
  test("escapes square brackets so the link text cannot break out", () => {
    expect(deriveLinkTitle("# Release [v2] notes")).toBe(
      "Release \\[v2\\] notes",
    );
  });

  test("collapses a heading that spans trailing whitespace and hashes", () => {
    expect(deriveLinkTitle("#   Trimmed heading   \n")).toBe("Trimmed heading");
  });

  // AI responses often open with a code block, and `# ...` shell comments in
  // one are not headings.
  test("ignores hash comments inside fenced code blocks", () => {
    const content = "```bash\n# install deps\nnpm install\n```\n\n# Real heading\n";
    expect(deriveLinkTitle(content)).toBe("Real heading");
  });

  test("truncates an overlong title", () => {
    const title = deriveLinkTitle(`# ${"word ".repeat(40)}`);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("buildMarkdownLink", () => {
  test("composes a markdown link from the derived title and the url", () => {
    expect(buildMarkdownLink("# API design review", URL)).toBe(
      `[API design review](${URL})`,
    );
  });

  test("still produces valid markdown for blank content", () => {
    expect(buildMarkdownLink("", URL)).toBe(`[Shared AI response](${URL})`);
  });
});
