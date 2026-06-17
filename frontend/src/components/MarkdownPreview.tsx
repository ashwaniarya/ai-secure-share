import { lazy, Suspense, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// Lazy so mermaid + the zoom library stay out of the main bundle; the chunk is
// fetched only when a document actually contains a ```mermaid block.
const MermaidDiagram = lazy(() => import("./MermaidDiagram"));

interface MarkdownPreviewProps {
  content: string;
  /** Render ```mermaid blocks as diagrams. Defaults to on. */
  enableMermaid?: boolean;
}

/**
 * Renders untrusted markdown safely.
 *
 * react-markdown does not parse embedded raw HTML (no rehype-raw is used), and
 * rehype-sanitize is layered on as defense-in-depth. This component is the only
 * place share content is turned into DOM, so all XSS protection lives here.
 *
 * The `code` override only re-routes fenced ```mermaid blocks to MermaidDiagram
 * (which renders DOMPurify-scrubbed SVG under mermaid's strict security level).
 * Every other code block falls through to the default <code> rendering, and the
 * global rehype-sanitize schema is left untouched.
 */
export default function MarkdownPreview({
  content,
  enableMermaid = true,
}: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview" data-testid="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
            const isMermaid = /\blanguage-mermaid\b/.test(className ?? "");
            if (enableMermaid && isMermaid) {
              const source = extractText(children).replace(/\n$/, "");
              return (
                <Suspense
                  fallback={
                    <div className="mermaid-diagram mermaid-loading" aria-busy="true">
                      Loading diagram…
                    </div>
                  }
                >
                  <MermaidDiagram code={source} />
                </Suspense>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Flattens react-markdown's `children` (string | nested arrays) to plain text. */
function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  return "";
}
