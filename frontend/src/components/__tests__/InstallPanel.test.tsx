import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import InstallPanel from "../InstallPanel";
import { copyToClipboard } from "../../lib/clipboard";

vi.mock("../../lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

afterEach(() => vi.mocked(copyToClipboard).mockClear());

test("shows the copy-paste install prompt", () => {
  render(<InstallPanel />);
  expect(
    screen.getByText(/Install the ai-response-share Claude Code skill/i),
  ).toBeInTheDocument();
});

test("copies the install prompt", async () => {
  const user = userEvent.setup();
  render(<InstallPanel />);
  await user.click(screen.getByRole("button", { name: /copy/i }));
  expect(copyToClipboard).toHaveBeenCalledWith(
    expect.stringContaining("ai-response-share"),
  );
});
