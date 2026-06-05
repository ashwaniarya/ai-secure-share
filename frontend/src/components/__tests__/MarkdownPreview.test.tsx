import { render, screen } from "@testing-library/react";
import MarkdownPreview from "../MarkdownPreview";

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
