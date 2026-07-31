import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import AgentComposerDemo from "../AgentComposerDemo";
import { SKILL_EXAMPLES } from "../../lib/skill";

// Assert against the shared example list rather than literal copy, so
// re-wording the landing page never breaks the animation tests.
const [FIRST_EXAMPLE, SECOND_EXAMPLE] = SKILL_EXAMPLES;

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
  render(<AgentComposerDemo />);
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  const typed = screen.getByTestId("composer-task").textContent ?? "";
  expect(typed.length).toBeGreaterThan(0);
  expect(FIRST_EXAMPLE.startsWith(typed)).toBe(true);
});

test("rolls on to the next example (motion)", () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  render(<AgentComposerDemo />);
  // First example: type (55ms/char), hold 1500ms, delete (28ms/char), gap
  // 350ms — so the second example is mid-type a little after 6s.
  act(() => {
    vi.advanceTimersByTime(6000);
  });
  const typed = screen.getByTestId("composer-task").textContent ?? "";
  expect(typed.length).toBeGreaterThan(0);
  expect(SECOND_EXAMPLE.startsWith(typed)).toBe(true);
});

test("renders examples statically when reduced motion is preferred", () => {
  setReducedMotion(true);
  render(<AgentComposerDemo />);
  expect(screen.getByTestId("composer-task").textContent).toContain(
    FIRST_EXAMPLE,
  );
  expect(screen.getByText(SECOND_EXAMPLE)).toBeInTheDocument();
});

test("the send button has a label and calls onSend when clicked", async () => {
  const onSend = vi.fn();
  const user = userEvent.setup();
  render(<AgentComposerDemo onSend={onSend} />);
  await user.click(screen.getByRole("button", { name: /install instructions/i }));
  expect(onSend).toHaveBeenCalledOnce();
});
