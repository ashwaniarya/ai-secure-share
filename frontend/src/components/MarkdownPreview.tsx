import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

/**
 * Renders untrusted markdown safely.
 *
 * react-markdown does not parse embedded raw HTML (no rehype-raw is used), and
 * rehype-sanitize is layered on as defense-in-depth. This component is the only
 * place share content is turned into DOM, so all XSS protection lives here.
 */
export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview" data-testid="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
