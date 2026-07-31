import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
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

test("shows the formatted count once loaded", async () => {
  vi.mocked(getStats).mockResolvedValue({ share_count: 12345 });
  render(<ShareCounter />);
  expect(await screen.findByText("12,345")).toBeInTheDocument();
});

test("stays hidden when the stats request fails", async () => {
  vi.mocked(getStats).mockRejectedValue(new Error("down"));
  render(<ShareCounter />);
  await waitFor(() => expect(getStats).toHaveBeenCalled());
  expect(screen.queryByText(/links created/i)).not.toBeInTheDocument();
});

test("stays hidden below the social-proof threshold", async () => {
  vi.mocked(getStats).mockResolvedValue({ share_count: 3 });
  render(<ShareCounter />);
  await waitFor(() => expect(getStats).toHaveBeenCalled());
  expect(screen.queryByText(/links created/i)).not.toBeInTheDocument();
});
