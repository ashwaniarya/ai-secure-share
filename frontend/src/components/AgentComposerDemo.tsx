import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { SKILL_EXAMPLES } from "../lib/skill";

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1500;
const GAP_MS = 350;

interface AgentComposerDemoProps {
  examples?: string[];
  /** Fired when the send affordance is clicked (reveals install instructions). */
  onSend?: () => void;
}

/**
 * AI-agent composer mock: a clean prompt bar that rolls through example
 * `/ai-response-share` requests with a typewriter effect and a send button.
 * Under reduced motion it renders the examples statically.
 */
export default function AgentComposerDemo({
  examples = SKILL_EXAMPLES,
  onSend,
}: AgentComposerDemoProps) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? examples[0] : "");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (reduced) {
      setDisplay(examples[0]);
      return;
    }
    let cancelled = false;
    let exampleIndex = 0;
    let charCount = 0;
    let mode: "typing" | "holding" | "deleting" = "typing";

    const step = () => {
      if (cancelled) return;
      const full = examples[exampleIndex];
      if (mode === "typing") {
        charCount += 1;
        setDisplay(full.slice(0, charCount));
        if (charCount >= full.length) {
          mode = "holding";
          timer.current = setTimeout(step, HOLD_MS);
        } else {
          timer.current = setTimeout(step, TYPE_MS);
        }
      } else if (mode === "holding") {
        mode = "deleting";
        timer.current = setTimeout(step, DELETE_MS);
      } else {
        charCount -= 1;
        setDisplay(full.slice(0, Math.max(charCount, 0)));
        if (charCount <= 0) {
          exampleIndex = (exampleIndex + 1) % examples.length;
          mode = "typing";
          timer.current = setTimeout(step, GAP_MS);
        } else {
          timer.current = setTimeout(step, DELETE_MS);
        }
      }
    };

    timer.current = setTimeout(step, TYPE_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reduced, examples]);

  return (
    <div className="composer">
      <div className="composer-bar">
        <span className="composer-chip">/ai-response-share</span>
        <span className="composer-task" data-testid="composer-task">
          {display}
        </span>
        <span className="composer-caret" aria-hidden="true" />
        <button
          type="button"
          className="composer-send"
          aria-label="Show install instructions"
          onClick={onSend}
        >
          →
        </button>
      </div>
      <p className="composer-hint" aria-hidden="true">
        Press → to add it to your agent
      </p>
      {reduced && (
        <ul className="composer-examples" aria-hidden="true">
          {examples.slice(1, 4).map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      )}
      <p className="sr-only">
        Use the /ai-response-share skill in your AI agent — for example, “
        {examples[0]}”.
      </p>
    </div>
  );
}
