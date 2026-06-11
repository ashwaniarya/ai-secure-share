import { useEffect } from "react";
import useLocalStorage from "../hooks/useLocalStorage";

const WIDTH_KEY = "ars:view-width";
const FONT_SCALE_KEY = "ars:view-font-scale";
const FONT_SCALE_MIN = 0.7;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.1;

/** Clamp into bounds and round to one decimal; anything non-numeric becomes 1. */
function clampScale(value: unknown): number {
  const numeric =
    typeof value === "number" && Number.isFinite(value) ? value : 1;
  const bounded = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, numeric));
  return Math.round(bounded * 10) / 10;
}

function ExpandIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function CompactIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 14 10 14 10 20" />
      <line x1="3" y1="21" x2="10" y2="14" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
    </svg>
  );
}

/**
 * Floating reader controls for the share view page.
 *
 * Width mode and font scale persist in localStorage so every share link opens
 * with the same view. The component applies them via a body class /
 * CSS custom property (consumed in styles.css) and cleans both up on unmount.
 */
export default function ViewQuickActions() {
  const [width, setWidth] = useLocalStorage<"compact" | "full">(
    WIDTH_KEY,
    "compact",
  );
  const [storedScale, setStoredScale] = useLocalStorage<number>(
    FONT_SCALE_KEY,
    1,
  );
  const isFull = width === "full";
  const scale = clampScale(storedScale);

  useEffect(() => {
    document.body.classList.toggle("view-full", isFull);
    return () => document.body.classList.remove("view-full");
  }, [isFull]);

  useEffect(() => {
    document.body.style.setProperty("--view-font-scale", String(scale));
    return () => {
      document.body.style.removeProperty("--view-font-scale");
    };
  }, [scale]);

  const widthLabel = isFull ? "Compact" : "Expand";

  return (
    <div className="quick-actions" role="group" aria-label="View options">
      <button
        type="button"
        aria-label={widthLabel}
        data-tooltip={widthLabel}
        aria-pressed={isFull}
        onClick={() => setWidth(isFull ? "compact" : "full")}
      >
        {isFull ? <CompactIcon /> : <ExpandIcon />}
      </button>
      <span className="quick-actions-divider" aria-hidden="true" />
      <button
        type="button"
        aria-label="Decrease font"
        data-tooltip="Decrease font"
        disabled={scale <= FONT_SCALE_MIN}
        onClick={() =>
          setStoredScale((prev) => clampScale(clampScale(prev) - FONT_SCALE_STEP))
        }
      >
        A−
      </button>
      <button
        type="button"
        aria-label="Increase font"
        data-tooltip="Increase font"
        disabled={scale >= FONT_SCALE_MAX}
        onClick={() =>
          setStoredScale((prev) => clampScale(clampScale(prev) + FONT_SCALE_STEP))
        }
      >
        A+
      </button>
    </div>
  );
}
