import { render, screen } from "@testing-library/react";
import MarkdownPreview from "../MarkdownPreview";

// Keep these tests about ROUTING, not diagram rendering: stub MermaidDiagram so
// we assert which blocks reach it without pulling in mermaid / the zoom lib.
vi.mock("../MermaidDiagram", () => ({
  default: ({ code }: { code: string }) => (
    <div data-testid="mermaid-diagram">{code}</div>
  ),
}));

declare global {
  interface Window {
    __pwned?: boolean;
    __xss?: boolean;
  }
}

test("renders markdown headings and emphasis", () => {
  render(<MarkdownPreview content={"# Title\n\nsome **bold** text"} />);
  expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
  expect(screen.getByText("bold")).toBeInTheDocument();
});

test("does not render raw HTML <script> tags", () => {
  const { container } = render(
    <MarkdownPreview content={"<script>window.__pwned = true</script>\n\nhi"} />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(window.__pwned).toBeUndefined();
});

test("does not render raw HTML img with onerror handler", () => {
  const { container } = render(
    <MarkdownPreview content={'<img src=x onerror="window.__xss=true" />'} />,
  );
  expect(container.querySelector("img")).toBeNull();
  expect(window.__xss).toBeUndefined();
});

test("neutralizes javascript: links", () => {
  const { container } = render(
    <MarkdownPreview content={"[click me](javascript:alert(1))"} />,
  );
  const link = container.querySelector("a");
  expect(link?.getAttribute("href") ?? "").not.toContain("javascript:");
});

test("routes ```mermaid blocks to the diagram renderer with the block source", async () => {
  render(<MarkdownPreview content={"```mermaid\ngraph TD\n  A-->B\n```"} />);
  const diagram = await screen.findByTestId("mermaid-diagram");
  expect(diagram).toHaveTextContent("graph TD");
  expect(diagram).toHaveTextContent("A-->B");
});

test("renders non-mermaid fenced code as plain code, not a diagram", () => {
  const { container } = render(
    <MarkdownPreview content={"```js\nconst x = 1;\n```"} />,
  );
  expect(container.querySelector("code.language-js")).not.toBeNull();
  expect(screen.queryByTestId("mermaid-diagram")).toBeNull();
});

test("enableMermaid=false leaves ```mermaid as a plain code block", () => {
  const { container } = render(
    <MarkdownPreview content={"```mermaid\ngraph TD\n  A-->B\n```"} enableMermaid={false} />,
  );
  expect(screen.queryByTestId("mermaid-diagram")).toBeNull();
  expect(container.querySelector("code.language-mermaid")).not.toBeNull();
});

test("passes mermaid source through as inert text (not parsed as HTML)", async () => {
  const md = '```mermaid\ngraph TD\n  A["<img src=x onerror=window.__xss=true>"]\n```';
  const { container } = render(<MarkdownPreview content={md} />);
  const diagram = await screen.findByTestId("mermaid-diagram");
  // the markdown pipeline hands the diagram component the raw source as text;
  // it never becomes a real <img>, and nothing executes.
  expect(container.querySelector("img")).toBeNull();
  expect(window.__xss).toBeUndefined();
  expect(diagram).toHaveTextContent("onerror=window.__xss=true");
});
