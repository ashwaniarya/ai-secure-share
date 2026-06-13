import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import CreatedResult from "../CreatedResult";
import { copyToClipboard } from "../../lib/clipboard";

vi.mock("../../lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

afterEach(() => vi.mocked(copyToClipboard).mockClear());

const share = {
  slug: "aB3x9",
  manage_token: "secret-token",
  url: "https://airesponseshare.com/s/aB3x9",
  expires_at: null,
};

test("renders the link, manage token, and once-only warning", () => {
  render(<CreatedResult share={share} onCreateAnother={() => {}} />);
  expect(screen.getByText(share.url)).toBeInTheDocument();
  expect(screen.getByText("secret-token")).toBeInTheDocument();
  expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
});

test("copies the link", async () => {
  const user = userEvent.setup();
  render(<CreatedResult share={share} onCreateAnother={() => {}} />);
  await user.click(screen.getByRole("button", { name: /copy link/i }));
  expect(copyToClipboard).toHaveBeenCalledWith(share.url);
});

test("invokes onCreateAnother", async () => {
  const onCreateAnother = vi.fn();
  const user = userEvent.setup();
  render(<CreatedResult share={share} onCreateAnother={onCreateAnother} />);
  await user.click(screen.getByRole("button", { name: /create another/i }));
  expect(onCreateAnother).toHaveBeenCalledOnce();
});
