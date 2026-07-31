import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ShareCounter from "../ShareCounter";
import { getStats } from "../../api/client";

vi.mock("../../api/client", () => ({
  getStats: vi.fn(),
}));

// Braces matter: returning the mock from beforeEach would make vitest call it
// as a teardown fn, leaving an unhandled rejected promise in rejection tests.
beforeEach(() => {
  vi.mocked(getStats).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The rail entry's label — present only when the counter renders at all. */
const RAIL_LABEL = "shared";

test("shows the formatted count once loaded", async () => {
  vi.mocked(getStats).mockResolvedValue({ share_count: 12345 });
  render(<ShareCounter />);
  expect(await screen.findByText("12,345")).toBeInTheDocument();
  expect(screen.getByText(RAIL_LABEL)).toBeInTheDocument();
});

test("stays hidden when the stats request fails", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getStats).mockRejectedValue(new Error("down"));
  render(<ShareCounter />);
  await waitFor(() => expect(getStats).toHaveBeenCalled());
  expect(screen.queryByText(RAIL_LABEL)).not.toBeInTheDocument();
  // An outage must leave a trace, since the UI looks identical to a low count.
  await waitFor(() => expect(consoleError).toHaveBeenCalled());
});

test("stays hidden below the social-proof threshold", async () => {
  vi.mocked(getStats).mockResolvedValue({ share_count: 3 });
  render(<ShareCounter />);
  await waitFor(() => expect(getStats).toHaveBeenCalled());
  expect(screen.queryByText(RAIL_LABEL)).not.toBeInTheDocument();
});

// The declared Stats type is only a compile-time claim: these payloads are what
// a renamed field or a proxy error page actually delivers at runtime, and each
// one previously reached count.toLocaleString() and crashed the render.
test.each([
  ["share_count missing", {}],
  ["share_count null", { share_count: null }],
  ["share_count a string", { share_count: "1202" }],
  ["share_count NaN", { share_count: Number.NaN }],
])("stays hidden and does not crash when %s", async (_label, payload) => {
  vi.mocked(getStats).mockResolvedValue(payload as never);
  render(<ShareCounter />);
  await waitFor(() => expect(getStats).toHaveBeenCalled());
  expect(screen.queryByText(RAIL_LABEL)).not.toBeInTheDocument();
});
