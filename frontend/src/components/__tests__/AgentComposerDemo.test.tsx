import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import AgentComposerDemo from "../AgentComposerDemo";

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
  expect(screen.getByTestId("composer-task").textContent).toContain(
    "create a shareable plan",
  );
});

test("rolls on to the next example (motion)", () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  render(<AgentComposerDemo />);
  act(() => {
    vi.advanceTimersByTime(9000);
  });
  expect(screen.getByTestId("composer-task").textContent).toContain(
    "API design",
  );
});

test("renders examples statically when reduced motion is preferred", () => {
  setReducedMotion(true);
  render(<AgentComposerDemo />);
  expect(screen.getByTestId("composer-task").textContent).toContain(
    "create a shareable plan to send to my boss",
  );
  expect(screen.getByText(/share this API design/i)).toBeInTheDocument();
});

test("the send button has a label and calls onSend when clicked", async () => {
  const onSend = vi.fn();
  const user = userEvent.setup();
  render(<AgentComposerDemo onSend={onSend} />);
  await user.click(screen.getByRole("button", { name: /install instructions/i }));
  expect(onSend).toHaveBeenCalledOnce();
});
