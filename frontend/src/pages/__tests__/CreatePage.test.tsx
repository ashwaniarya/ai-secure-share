import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as client from "../../api/client";
import CreatePage from "../CreatePage";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, createShare: vi.fn() };
});

afterEach(() => vi.resetAllMocks());

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderPage() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <CreatePage />
    </MemoryRouter>,
  );
}

test("creates a share and shows the link and manage token once", async () => {
  vi.mocked(client.createShare).mockResolvedValue({
    slug: "abc",
    manage_token: "secret-token",
    url: "http://localhost/s/abc",
    expires_at: null,
  });
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText(/markdown/i), "# Hello");
  await user.click(screen.getByRole("button", { name: /create/i }));

  expect(client.createShare).toHaveBeenCalledWith(
    expect.objectContaining({ content: "# Hello" }),
  );
  expect(await screen.findByText("http://localhost/s/abc")).toBeInTheDocument();
  expect(screen.getByText("secret-token")).toBeInTheDocument();
});

test("renders a live preview of the entered markdown", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.type(screen.getByLabelText(/markdown/i), "# Live Heading");
  expect(
    screen.getByRole("heading", { name: "Live Heading" }),
  ).toBeInTheDocument();
});

test("includes password and expiry when supplied", async () => {
  vi.mocked(client.createShare).mockResolvedValue({
    slug: "abc",
    manage_token: "t",
    url: "u",
    expires_at: null,
  });
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText(/markdown/i), "x");
  await user.type(screen.getByLabelText(/password/i), "pw");
  await user.selectOptions(screen.getByLabelText(/expires/i), "3600");
  await user.click(screen.getByRole("button", { name: /create/i }));

  expect(client.createShare).toHaveBeenCalledWith({
    content: "x",
    password: "pw",
    expires_in_seconds: 3600,
  });
});

test("shows an error message when creation fails", async () => {
  vi.mocked(client.createShare).mockRejectedValue(
    new client.ApiError(500, "server exploded"),
  );
  const user = userEvent.setup();
  renderPage();

  await user.type(screen.getByLabelText(/markdown/i), "x");
  await user.click(screen.getByRole("button", { name: /create/i }));

  expect(await screen.findByText(/server exploded/i)).toBeInTheDocument();
});

test("marks the body for home-page styling while mounted", () => {
  const { unmount } = renderPage();
  expect(document.body.classList.contains("home")).toBe(true);
  unmount();
  expect(document.body.classList.contains("home")).toBe(false);
});
