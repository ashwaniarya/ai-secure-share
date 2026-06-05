import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as client from "../../api/client";
import ManagePage from "../ManagePage";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    getShare: vi.fn(),
    updateShare: vi.fn(),
    deleteShare: vi.fn(),
  };
});

afterEach(() => vi.resetAllMocks());

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function viewWith(content: string) {
  return {
    slug: "abc",
    content,
    has_password: false,
    expires_at: null,
    created_at: "",
    updated_at: "",
  };
}

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/s/abc/manage"]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/s/:slug/manage" element={<ManagePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function load(user: UserEvent, token = "tok") {
  await user.type(screen.getByLabelText(/manage token/i), token);
  await user.click(screen.getByRole("button", { name: /load/i }));
}

test("loads existing content for editing using the token", async () => {
  vi.mocked(client.getShare).mockResolvedValue(viewWith("# Original"));
  const user = userEvent.setup();
  renderAt();

  await load(user);

  expect(await screen.findByDisplayValue("# Original")).toBeInTheDocument();
  expect(client.getShare).toHaveBeenCalledWith("abc", "tok");
});

test("saves edited content with the manage token", async () => {
  vi.mocked(client.getShare).mockResolvedValue(viewWith("# Original"));
  vi.mocked(client.updateShare).mockResolvedValue(viewWith("# Updated"));
  const user = userEvent.setup();
  renderAt();
  await load(user);

  const editor = await screen.findByLabelText(/markdown/i);
  await user.clear(editor);
  await user.type(editor, "# Updated");
  await user.click(screen.getByRole("button", { name: /save/i }));

  expect(client.updateShare).toHaveBeenCalledWith(
    "abc",
    "tok",
    expect.objectContaining({ content: "# Updated" }),
  );
  expect(await screen.findByText(/saved/i)).toBeInTheDocument();
});

test("shows an error when saving with an invalid token", async () => {
  vi.mocked(client.getShare).mockResolvedValue(viewWith("# Original"));
  vi.mocked(client.updateShare).mockRejectedValue(
    new client.ApiError(403, "Invalid manage token"),
  );
  const user = userEvent.setup();
  renderAt();
  await load(user);

  await user.click(screen.getByRole("button", { name: /save/i }));

  expect(await screen.findByText(/invalid manage token/i)).toBeInTheDocument();
});

test("deletes the share after confirmation", async () => {
  vi.mocked(client.getShare).mockResolvedValue(viewWith("# Original"));
  vi.mocked(client.deleteShare).mockResolvedValue(undefined);
  const user = userEvent.setup();
  renderAt();
  await load(user);

  await user.click(screen.getByRole("button", { name: /^delete$/i }));
  await user.click(screen.getByRole("button", { name: /yes, delete/i }));

  expect(client.deleteShare).toHaveBeenCalledWith("abc", "tok");
  expect(
    await screen.findByRole("heading", { name: /deleted/i }),
  ).toBeInTheDocument();
});
