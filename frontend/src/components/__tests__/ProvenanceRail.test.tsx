import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import ProvenanceRail from "../ProvenanceRail";

function renderRail(entries: Parameters<typeof ProvenanceRail>[0]["entries"]) {
  render(<ProvenanceRail entries={entries} />);
  return within(
    screen.getByRole("complementary", { name: /record details/i }),
  );
}

test("renders a label with its value", () => {
  const rail = renderRail([{ label: "cipher", values: ["AES-256-GCM"] }]);
  expect(rail.getByText("cipher")).toBeInTheDocument();
  expect(rail.getByText("AES-256-GCM")).toBeInTheDocument();
});

test("stacks every value under a single label", () => {
  // Only the hero uses this branch (five agents under one label), so nothing
  // else would catch a regression that drops all but the first value.
  const agents = ["Claude Code", "Cursor", "Codex"];
  const rail = renderRail([{ label: "agents", values: agents as [string, ...string[]] }]);
  for (const agent of agents) {
    expect(rail.getByText(agent)).toBeInTheDocument();
  }
});

test("renders repeated values rather than collapsing them", () => {
  // Values are keyed by position, not content: keying by value would drop the
  // duplicate and silently render one row instead of two.
  const rail = renderRail([{ label: "seen", values: ["Never", "Never"] }]);
  expect(rail.getAllByText("Never")).toHaveLength(2);
});

test("renders children after the entries", () => {
  render(
    <ProvenanceRail entries={[{ label: "agents", values: ["Cursor"] }]}>
      <div className="rail-item">shared</div>
    </ProvenanceRail>,
  );
  const rail = within(
    screen.getByRole("complementary", { name: /record details/i }),
  );
  expect(rail.getByText("Cursor")).toBeInTheDocument();
  expect(rail.getByText("shared")).toBeInTheDocument();
});
