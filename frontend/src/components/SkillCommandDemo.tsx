import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { SKILL_EXAMPLES } from "../lib/skill";

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1500;
const GAP_MS = 350;

interface SkillCommandDemoProps {
  examples?: string[];
}

/**
 * Terminal-styled hero centerpiece. Rolls through example `/ai-response-share`
 * requests with a typewriter effect; under reduced-motion it renders the
 * examples statically instead of animating.
 */
export default function SkillCommandDemo({
  examples = SKILL_EXAMPLES,
}: SkillCommandDemoProps) {
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
    <div className="skill-demo">
      <div className="skill-demo-bar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="skill-demo-line" aria-hidden="true">
        <span className="skill-demo-prompt">❯</span>
        <span className="skill-demo-cmd">/ai-response-share</span>
        <span className="skill-demo-task" data-testid="skill-demo-task">
          {display}
        </span>
        <span className="skill-demo-cursor" />
      </div>
      {reduced && (
        <ul className="skill-demo-list" aria-hidden="true">
          {examples.slice(1, 4).map((example) => (
            <li key={example}>
              <span className="skill-demo-prompt">❯</span>
              <span className="skill-demo-cmd">/ai-response-share</span> {example}
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only">
        Use the /ai-response-share skill in Claude Code — for example, “
        {examples[0]}”.
      </p>
    </div>
  );
}
