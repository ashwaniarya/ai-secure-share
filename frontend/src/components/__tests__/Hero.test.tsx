import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import Hero from "../Hero";
import { getStats } from "../../api/client";
import { copyToClipboard } from "../../lib/clipboard";
import { INSTALL_PROMPT } from "../../lib/skill";

vi.mock("../../lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

// Pending by default so sync tests see no late state update (act warnings);
// the proof-line test resolves it explicitly.
vi.mock("../../api/client", () => ({
  getStats: vi.fn(() => new Promise(() => {})),
}));

afterEach(() => {
  vi.mocked(copyToClipboard).mockClear();
});

test("renders the agent-first headline and feature chips", () => {
  render(<Hero />);
  expect(
    screen.getByRole("heading", {
      name: /turn any AI response into a shareable link/i,
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/from your AI agent/i)).toBeInTheDocument();
  for (const chip of [/XSS-safe/i, /password/i, /expiry/i, /rich link previews/i]) {
    expect(screen.getByText(chip)).toBeInTheDocument();
  }
});

test("lists the agents it works with", () => {
  render(<Hero />);
  expect(screen.getByText("Claude Code")).toBeInTheDocument();
  expect(screen.getByText("Cursor")).toBeInTheDocument();
});

test("clicking the composer send reveals the install panel and copies the prompt", async () => {
  const user = userEvent.setup();
  render(<Hero />);
  expect(
    screen.queryByText(/Install the ai-response-share Claude Code skill/i),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /install instructions/i }));
  expect(
    await screen.findByText(/Install the ai-response-share Claude Code skill/i),
  ).toBeInTheDocument();
  expect(copyToClipboard).toHaveBeenCalledWith(INSTALL_PROMPT);
});

test("shows the links-created proof line", async () => {
  vi.mocked(getStats).mockResolvedValueOnce({ share_count: 1234 });
  render(<Hero />);
  expect(await screen.findByText(/1,234 links created/i)).toBeInTheDocument();
});

test("offers a path for other agents", () => {
  render(<Hero />);
  const link = screen.getByRole("link", { name: /using another agent/i });
  expect(link).toHaveAttribute("href", expect.stringContaining("github.com"));
});
