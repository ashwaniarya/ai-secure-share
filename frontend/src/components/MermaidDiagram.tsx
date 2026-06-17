import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
} from "react-zoom-pan-pinch";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * Renders a ```mermaid fenced block as an interactive (zoom/pan/fullscreen)
 * diagram.
 *
 * Security: the only new HTML sink is injecting mermaid's rendered SVG via
 * dangerouslySetInnerHTML. This does NOT reopen the XSS hole that the document
 * sanitizer (rehype-sanitize in MarkdownPreview) closes, because mermaid is
 * initialized with `securityLevel: 'strict'`: it runs DOMPurify over its own
 * SVG output, renders labels as SVG <text> (htmlLabels disabled), and ignores
 * `click`/interaction directives. The diagram source we feed in is itself the
 * sanitizer's plain-text output, so untrusted input only ever reaches mermaid's
 * hardened parser → DOMPurify-scrubbed SVG.
 *
 * mermaid (~large) is dynamically imported so diagram-free shares never pay for
 * it; this whole component is additionally React.lazy-loaded by MarkdownPreview.
 */

const RENDER_DEBOUNCE_MS = 250;

type MermaidApi = (typeof import("mermaid"))["default"];

let mermaidModule: MermaidApi | null = null;
let initialized = false;

/** Load mermaid once and initialize it exactly once per page (singleton). */
async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidModule) {
    mermaidModule = (await import("mermaid")).default;
  }
  if (!initialized) {
    mermaidModule.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
      fontFamily: "inherit",
    });
    initialized = true;
  }
  return mermaidModule;
}

/**
 * Mermaid emits `<svg width="100%" style="max-width:…">` with no intrinsic
 * pixel size. Inside the zoom viewport's fit-content content box that collapses
 * to ~0, so react-zoom-pan-pinch measures empty bounds and zoom/pan no-ops.
 * Rewrite the dimensions from the viewBox to give the content a stable size
 * (CSS still caps display width to the viewport via max-width:100%).
 */
function normalizeSvgDimensions(svg: string): string {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!match) return svg;
  const [, width, height] = match;
  return svg
    .replace(/\swidth="[^"]*"/, "")
    .replace(/\sstyle="max-width:[^"]*"/, "")
    .replace(/<svg /, `<svg width="${width}" height="${height}" `);
}

type RenderState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ok"; svg: string }
  | { status: "error"; message: string };

interface MermaidDiagramProps {
  code: string;
}

export default function MermaidDiagram({ code }: MermaidDiagramProps) {
  const reactId = useId();
  // mermaid.render() injects a temporary element keyed by this id; it must be a
  // CSS-selector-safe, collision-free string (useId emits colons → strip them).
  const domId = "mermaid-" + reactId.replace(/[^a-zA-Z0-9]/g, "");

  // Debounce the expensive render against fast-changing input (live preview);
  // the cheap text preview elsewhere stays instant.
  const debouncedCode = useDebouncedValue(code, RENDER_DEBOUNCE_MS);
  const reduced = usePrefersReducedMotion();

  const [state, setState] = useState<RenderState>({ status: "loading" });
  const [fullscreen, setFullscreen] = useState(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const source = debouncedCode.trim();
    if (!source) {
      setState({ status: "empty" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    loadMermaid()
      .then(async (mermaid) => {
        // parse first: catches syntax errors cleanly without DOM side effects.
        await mermaid.parse(source);
        const { svg } = await mermaid.render(domId, source);
        if (!cancelled) setState({ status: "ok", svg: normalizeSvgDimensions(svg) });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : String(error);
          setState({ status: "error", message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedCode, domId]);

  function openFullscreen() {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setFullscreen(true);
  }

  function closeFullscreen() {
    setFullscreen(false);
    restoreFocusRef.current?.focus?.();
  }

  if (state.status === "empty") return null;

  if (state.status === "loading") {
    return (
      <div className="mermaid-diagram mermaid-loading" aria-busy="true">
        Rendering diagram…
      </div>
    );
  }

  if (state.status === "error") {
    // Half-typed diagrams are expected to be invalid mid-stroke, so the fallback
    // is calm: show the original source verbatim plus a quiet note.
    return (
      <div className="mermaid-diagram mermaid-diagram-error">
        <pre>
          <code className="language-mermaid">{code}</code>
        </pre>
        <p className="muted mermaid-error-note" title={state.message}>
          Diagram could not be rendered.
        </p>
      </div>
    );
  }

  return (
    <>
      <DiagramViewport
        svg={state.svg}
        reduced={reduced}
        onFullscreen={openFullscreen}
      />
      {fullscreen &&
        createPortal(
          <DiagramFullscreen
            svg={state.svg}
            reduced={reduced}
            onClose={closeFullscreen}
          />,
          document.body,
        )}
    </>
  );
}

/** Zoomable/pannable viewport wrapping the rendered SVG, with corner controls. */
function DiagramViewport({
  svg,
  reduced,
  onFullscreen,
}: {
  svg: string;
  reduced: boolean;
  onFullscreen?: () => void;
}) {
  return (
    <div className="mermaid-diagram">
      <TransformWrapper
        minScale={0.5}
        maxScale={4}
        initialScale={1}
        centerOnInit
        // Diagrams are often smaller than the viewport; bounds-limiting would
        // clamp button "zoom to center" back to 1. Let it zoom/pan freely;
        // Reset recenters.
        limitToBounds={false}
        // Plain scroll passes through to the page; ctrl/⌘ (and trackpad pinch)
        // zoom — essential when many diagrams are stacked vertically.
        wheel={{ step: 0.2, activationKeys: ["Control", "Meta"] }}
        doubleClick={{ mode: "zoomIn", step: 0.7, animationTime: 0 }}
        zoomAnimation={{ disabled: reduced }}
        alignmentAnimation={{ disabled: reduced }}
        velocityAnimation={{ disabled: reduced }}
      >
        {/* Controls live INSIDE the wrapper and read live handlers via
            useControls(); the render-prop's handlers are captured before the
            library's imperative init and silently no-op. */}
        <ZoomControls onFullscreen={onFullscreen} />
        <TransformComponent
          wrapperClass="mermaid-diagram-viewport"
          contentClass="mermaid-diagram-content"
          // Inline so it beats the library's runtime-injected `fit-content`
          // sizing; the wrapper fills the bounded `.mermaid-diagram` box.
          wrapperStyle={{ width: "100%", height: "100%" }}
        >
          <div
            className="mermaid-diagram-svg"
            role="img"
            aria-label="Diagram"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

/** Full-viewport modal re-mounting the zoom viewport; focus-trapped, Esc closes. */
function DiagramFullscreen({
  svg,
  reduced,
  onClose,
}: {
  svg: string;
  reduced: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "Tab") {
        trapFocus(event, dialogRef.current);
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="diagram-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label="Diagram fullscreen view"
      ref={dialogRef}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="diagram-fullscreen-close"
        aria-label="Close fullscreen"
        data-tooltip="Close"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
      <DiagramViewport svg={svg} reduced={reduced} />
    </div>
  );
}

/** Keeps Tab focus cycling within the modal's focusable controls. */
function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'button, [href], [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ZoomControls({ onFullscreen }: { onFullscreen?: () => void }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  // Discrete button zoom is instant (animationTime 0): snappy for repeated
  // clicks and independent of requestAnimationFrame (which is throttled on
  // hidden/background tabs). Continuous wheel/pinch/pan stay smooth.
  return (
    <div className="diagram-zoom-controls" role="group" aria-label="Diagram zoom">
      <button
        type="button"
        aria-label="Zoom in"
        data-tooltip="Zoom in"
        onClick={() => zoomIn(0.5, 0)}
      >
        <ZoomInIcon />
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        data-tooltip="Zoom out"
        onClick={() => zoomOut(0.5, 0)}
      >
        <ZoomOutIcon />
      </button>
      <button
        type="button"
        aria-label="Reset"
        data-tooltip="Reset"
        onClick={() => resetTransform(0)}
      >
        <ResetIcon />
      </button>
      {onFullscreen && (
        <button
          type="button"
          aria-label="Fullscreen"
          data-tooltip="Fullscreen"
          onClick={onFullscreen}
        >
          <ExpandIcon />
        </button>
      )}
    </div>
  );
}

const ICON_PROPS = {
  "aria-hidden": true,
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ZoomInIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

/** Corners-in glyph: "fit / reset to 100%". Mirrors ViewQuickActions' CompactIcon. */
function ResetIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="4 14 10 14 10 20" />
      <line x1="3" y1="21" x2="10" y2="14" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
    </svg>
  );
}

/** Corners-out glyph: "expand / fullscreen". Mirrors ViewQuickActions' ExpandIcon. */
function ExpandIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="15 3 21 3 21 9" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
