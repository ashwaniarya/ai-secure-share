import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import CreatedResult from "../CreatedResult";
import { copyToClipboard } from "../../lib/clipboard";

vi.mock("../../lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

afterEach(() => vi.mocked(copyToClipboard).mockClear());

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderResult(share: Parameters<typeof CreatedResult>[0]["share"], onCreateAnother = () => {}) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <CreatedResult share={share} onCreateAnother={onCreateAnother} />
    </MemoryRouter>,
  );
}

const share = {
  slug: "aB3x9",
  manage_token: "secret-token",
  url: "https://airesponseshare.com/s/aB3x9",
  expires_at: null,
};

test("renders the link, manage token, and once-only warning", () => {
  renderResult(share);
  expect(screen.getByText(share.url)).toBeInTheDocument();
  expect(screen.getByText("secret-token")).toBeInTheDocument();
  expect(screen.getByText(/shown once/i)).toBeInTheDocument();
  expect(screen.getByText(/never recoverable/i)).toBeInTheDocument();
});

test("copies the link", async () => {
  const user = userEvent.setup();
  renderResult(share);
  await user.click(screen.getByRole("button", { name: /copy link/i }));
  expect(copyToClipboard).toHaveBeenCalledWith(share.url);
});

test("invokes onCreateAnother", async () => {
  const onCreateAnother = vi.fn();
  const user = userEvent.setup();
  renderResult(share, onCreateAnother);
  await user.click(screen.getByRole("button", { name: /create another/i }));
  expect(onCreateAnother).toHaveBeenCalledOnce();
});

// Regression: a scheme-less server URL must not render as a relative href.
// Otherwise the browser resolves it against the current page and produces the
// duplicated-domain link: airesponseshare.com/airesponseshare.com/s/<slug>.
const schemelessShare = {
  slug: "EBASTkuqVc8",
  manage_token: "secret-token",
  url: "airesponseshare.com/s/EBASTkuqVc8#k=Gjzoa4Sz4XmajYMp1X4Je6I2BtLLCLahv0SkMv71OAg",
  expires_at: null,
};
const absoluteUrl =
  "https://airesponseshare.com/s/EBASTkuqVc8#k=Gjzoa4Sz4XmajYMp1X4Je6I2BtLLCLahv0SkMv71OAg";

test("renders absolute hrefs when the server URL has no scheme", () => {
  renderResult(schemelessShare);
  // Every link that points at the share (i.e. not the masthead's home link)
  // must carry the absolute URL, both as an attribute and once resolved.
  const shareLinks = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href") !== "/");
  expect(shareLinks.length).toBeGreaterThan(0);
  for (const link of shareLinks) {
    expect(link.getAttribute("href")).toBe(absoluteUrl);
    expect(link).toHaveProperty("href", absoluteUrl);
  }
});

test("copies an absolute URL when the server URL has no scheme", async () => {
  const user = userEvent.setup();
  renderResult(schemelessShare);
  await user.click(screen.getByRole("button", { name: /copy link/i }));
  expect(copyToClipboard).toHaveBeenCalledWith(absoluteUrl);
});
