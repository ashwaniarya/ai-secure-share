import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import AgentComposerDemo from "../AgentComposerDemo";
import { SKILL_EXAMPLES } from "../../lib/skill";

// The animation tests drive explicit fixtures rather than production copy.
// Timing depends on example length, so real copy makes the assertions silently
// weaker as it is reworded — a shorter first example can leave the component
// still deleting example zero while a prefix check quietly passes.
const EXAMPLES = ["alpha", "bravo"];
const [FIRST_EXAMPLE, SECOND_EXAMPLE] = EXAMPLES;

// Scheduler (see AgentComposerDemo): type 55ms/char, hold 1500ms, delete
// 28ms/char, then a 350ms gap. For a 5-char example that puts example one
// fully typed and holding between 2485ms and 3985ms.
const FIRST_EXAMPLE_SETTLED_MS = 1000;
const SECOND_EXAMPLE_SETTLED_MS = 3000;

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.useRealTimers();
  setReducedMotion(false);
});

test("shows the /ai-response-share command chip", () => {
  render(<AgentComposerDemo />);
  expect(screen.getByText("/ai-response-share")).toBeInTheDocument();
});

test("types out the first example over time (motion)", () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  render(<AgentComposerDemo examples={EXAMPLES} />);
  act(() => {
    vi.advanceTimersByTime(FIRST_EXAMPLE_SETTLED_MS);
  });
  expect(screen.getByTestId("composer-task").textContent).toBe(FIRST_EXAMPLE);
});

test("rolls on to the next example (motion)", () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  render(<AgentComposerDemo examples={EXAMPLES} />);
  act(() => {
    vi.advanceTimersByTime(SECOND_EXAMPLE_SETTLED_MS);
  });
  // Exact equality, not a prefix check: a prefix assertion still passes while
  // the component is deleting example zero, so it cannot prove rotation.
  expect(screen.getByTestId("composer-task").textContent).toBe(SECOND_EXAMPLE);
});

test("renders examples statically when reduced motion is preferred", () => {
  setReducedMotion(true);
  // Production copy here on purpose: this path has no timing dependency, so it
  // is the right place to prove the real examples reach the DOM.
  render(<AgentComposerDemo />);
  expect(screen.getByTestId("composer-task").textContent).toContain(
    SKILL_EXAMPLES[0],
  );
  expect(screen.getByText(SKILL_EXAMPLES[1])).toBeInTheDocument();
});

test("the send button has a label and calls onSend when clicked", async () => {
  const onSend = vi.fn();
  const user = userEvent.setup();
  render(<AgentComposerDemo onSend={onSend} />);
  await user.click(screen.getByRole("button", { name: /install instructions/i }));
  expect(onSend).toHaveBeenCalledOnce();
});
