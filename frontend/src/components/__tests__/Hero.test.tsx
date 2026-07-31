import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import Hero from "../Hero";
import { getStats } from "../../api/client";
import { copyToClipboard } from "../../lib/clipboard";
import { AGENTS, INSTALL_PROMPT } from "../../lib/skill";

vi.mock("../../lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

// Pending by default so sync tests see no late state update (act warnings);
// the counter test resolves it explicitly.
vi.mock("../../api/client", () => ({
  getStats: vi.fn(() => new Promise(() => {})),
}));

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderHero() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <Hero />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.mocked(copyToClipboard).mockClear();
});

test("renders the agent-first headline and feature chips", () => {
  renderHero();
  expect(
    screen.getByRole("heading", {
      name: /your AI does the work/i,
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/from the agents they already use/i)).toBeInTheDocument();
  // "no accounts" is deliberately excluded — it also appears in the masthead.
  for (const chip of [
    /unfurls in slack/i,
    /end-to-end encrypted/i,
    /password \+ expiry/i,
  ]) {
    expect(screen.getByText(chip)).toBeInTheDocument();
  }
});

test("lists the agents it works with", () => {
  renderHero();
  // Scoped to the rail: an unscoped query would pass even if the rail were
  // deleted, since the agents used to be duplicated elsewhere on the page.
  const rail = within(
    screen.getByRole("complementary", { name: /record details/i }),
  );
  for (const agent of AGENTS) {
    expect(rail.getByText(agent)).toBeInTheDocument();
  }
  expect(rail.getByText(/any via CLI/i)).toBeInTheDocument();
});

test("clicking the composer send reveals the install panel and copies the prompt", async () => {
  const user = userEvent.setup();
  renderHero();
  expect(
    screen.queryByText(/Install the ai-response-share Claude Code skill/i),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /install instructions/i }));
  expect(
    await screen.findByText(/Install the ai-response-share Claude Code skill/i),
  ).toBeInTheDocument();
  expect(copyToClipboard).toHaveBeenCalledWith(INSTALL_PROMPT);
});

test("shows the live share count in the provenance rail", async () => {
  vi.mocked(getStats).mockResolvedValueOnce({ share_count: 1234 });
  renderHero();
  await screen.findByText("1,234");
  // Scoped: ShareCounter renders its own rail markup, so an unscoped query
  // passes even if the rail itself is removed from the hero.
  const rail = within(
    screen.getByRole("complementary", { name: /record details/i }),
  );
  expect(rail.getByText("1,234")).toBeInTheDocument();
});

test("offers a path for other agents", () => {
  renderHero();
  const link = screen.getByRole("link", { name: /roll it out to your team/i });
  expect(link).toHaveAttribute("href", expect.stringContaining("github.com"));
});
