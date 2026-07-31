import { Link } from "react-router-dom";

interface MastheadProps {
  /** Right-aligned machine metadata — provenance, slug, or state. */
  meta?: string;
}

/** Top rule carried by every page: mark, wordmark, and the record's state. */
export default function Masthead({ meta }: MastheadProps) {
  return (
    <div className="masthead">
      <span className="masthead-mark" aria-hidden="true" />
      <Link className="masthead-brand" to="/">
        ai-response-share
      </Link>
      {meta && <span className="masthead-meta">{meta}</span>}
    </div>
  );
}
