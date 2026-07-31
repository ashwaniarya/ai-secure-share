import { Link } from "react-router-dom";

interface MastheadProps {
  meta?: string;
}

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
