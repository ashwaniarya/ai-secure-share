import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import Hero from "../Hero";
import { copyToClipboard } from "../../lib/clipboard";
import { INSTALL_PROMPT } from "../../lib/skill";

// userEvent.setup() installs its own navigator.clipboard stub, so assert on the
// clipboard helper instead of the platform API.
vi.mock("../../lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

afterEach(() => vi.mocked(copyToClipboard).mockClear());

test("renders the headline and feature chips", () => {
  render(<Hero />);
  expect(
    screen.getByRole("heading", {
      name: /turn any AI response into a shareable link/i,
    }),
  ).toBeInTheDocument();
  for (const chip of [/XSS-safe/i, /password/i, /expiry/i, /rich link previews/i]) {
    expect(screen.getByText(chip)).toBeInTheDocument();
  }
});

test("shows the rolling skill command demo", () => {
  render(<Hero />);
  expect(screen.getByTestId("skill-demo-task")).toBeInTheDocument();
});

test("Add to Claude Code copies the install prompt and confirms", async () => {
  const user = userEvent.setup();
  render(<Hero />);
  await user.click(screen.getByRole("button", { name: /add to claude code/i }));
  expect(copyToClipboard).toHaveBeenCalledWith(INSTALL_PROMPT);
  expect(await screen.findByText(/copied/i)).toBeInTheDocument();
});
