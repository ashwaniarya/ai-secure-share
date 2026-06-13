import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import SkillCommandDemo from "../SkillCommandDemo";

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

test("shows the /ai-response-share command prefix", () => {
  render(<SkillCommandDemo />);
  expect(screen.getByText("/ai-response-share")).toBeInTheDocument();
});

test("types out the first example over time (motion)", () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  render(<SkillCommandDemo />);
  act(() => {
    vi.advanceTimersByTime(1500);
  });
  expect(screen.getByTestId("skill-demo-task").textContent).toContain(
    "create a shareable plan",
  );
});

test("rolls on to the next example (motion)", () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  render(<SkillCommandDemo />);
  act(() => {
    vi.advanceTimersByTime(9000);
  });
  expect(screen.getByTestId("skill-demo-task").textContent).toContain(
    "API design",
  );
});

test("renders examples statically when reduced motion is preferred", () => {
  setReducedMotion(true);
  render(<SkillCommandDemo />);
  expect(screen.getByTestId("skill-demo-task").textContent).toContain(
    "create a shareable plan to send to my boss",
  );
  expect(screen.getByText(/share this API design/i)).toBeInTheDocument();
});

test("clears its timer on unmount without throwing", () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  const { unmount } = render(<SkillCommandDemo />);
  act(() => {
    vi.advanceTimersByTime(500);
  });
  unmount();
  expect(() =>
    act(() => {
      vi.advanceTimersByTime(5000);
    }),
  ).not.toThrow();
});
