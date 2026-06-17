import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import * as client from "../../api/client";
import { encrypt, generateKey, keyToB64url } from "../../lib/crypto";
import ViewPage from "../ViewPage";

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, getShare: vi.fn(), unlockShare: vi.fn() };
});

afterEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  window.location.hash = "";
});

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderAt(slug = "abc") {
  return render(
    <MemoryRouter initialEntries={[`/s/${slug}`]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/s/:slug" element={<ViewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const PUBLIC_VIEW = {
  slug: "abc",
  content: "# Public Doc",
  has_password: false,
  expires_at: null,
  created_at: "",
  updated_at: "",
};

const LOCKED_VIEW = { ...PUBLIC_VIEW, content: null, has_password: true };

function encryptedView(envelope: string) {
  return { ...PUBLIC_VIEW, content: envelope };
}

test("renders public markdown content", async () => {
  vi.mocked(client.getShare).mockResolvedValue(PUBLIC_VIEW);
  renderAt();
  expect(
    await screen.findByRole("heading", { name: "Public Doc" }),
  ).toBeInTheDocument();
});

test("shows the view quick actions once content is ready", async () => {
  vi.mocked(client.getShare).mockResolvedValue(PUBLIC_VIEW);
  renderAt();
  await screen.findByRole("heading", { name: "Public Doc" });
  expect(
    screen.getByRole("group", { name: "View options" }),
  ).toBeInTheDocument();
});

test("hides the view quick actions while password-locked", async () => {
  vi.mocked(client.getShare).mockResolvedValue(LOCKED_VIEW);
  renderAt();
  await screen.findByLabelText(/password/i);
  expect(
    screen.queryByRole("group", { name: "View options" }),
  ).not.toBeInTheDocument();
});

test("shows a not-found message on 404", async () => {
  vi.mocked(client.getShare).mockRejectedValue(
    new client.ApiError(404, "Share not found"),
  );
  renderAt();
  expect(await screen.findByText(/not found/i)).toBeInTheDocument();
});

test("shows an expired message on 410", async () => {
  vi.mocked(client.getShare).mockRejectedValue(new client.ApiError(410, "gone"));
  renderAt();
  expect(
    await screen.findByRole("heading", { name: /expired/i }),
  ).toBeInTheDocument();
});

test("prompts for a password then renders unlocked content", async () => {
  vi.mocked(client.getShare).mockResolvedValue(LOCKED_VIEW);
  vi.mocked(client.unlockShare).mockResolvedValue({ content: "# Secret Doc" });
  const user = userEvent.setup();
  renderAt();

  await user.type(await screen.findByLabelText(/password/i), "pw");
  await user.click(screen.getByRole("button", { name: /unlock/i }));

  expect(client.unlockShare).toHaveBeenCalledWith("abc", "pw");
  expect(
    await screen.findByRole("heading", { name: "Secret Doc" }),
  ).toBeInTheDocument();
});

test("decrypts and renders an encrypted envelope with the #k= key", async () => {
  const key = generateKey();
  const envelope = await encrypt("# Encrypted Doc", key);
  window.location.hash = "#k=" + keyToB64url(key);
  vi.mocked(client.getShare).mockResolvedValue(encryptedView(envelope));
  renderAt();

  expect(
    await screen.findByRole("heading", { name: "Encrypted Doc" }),
  ).toBeInTheDocument();
});

test("shows a need-key message when the envelope has no key in the hash", async () => {
  const key = generateKey();
  const envelope = await encrypt("# Encrypted Doc", key);
  window.location.hash = "";
  vi.mocked(client.getShare).mockResolvedValue(encryptedView(envelope));
  renderAt();

  expect(await screen.findByText(/missing its key/i)).toBeInTheDocument();
});

test("shows a decrypt-error message when the key is wrong", async () => {
  const key = generateKey();
  const envelope = await encrypt("# Encrypted Doc", key);
  // A different, valid 32-byte key — structurally fine but won't decrypt.
  window.location.hash = "#k=" + keyToB64url(generateKey());
  vi.mocked(client.getShare).mockResolvedValue(encryptedView(envelope));
  renderAt();

  expect(
    await screen.findByText(/the key in this link looks wrong/i),
  ).toBeInTheDocument();
});

test("shows an error on wrong password", async () => {
  vi.mocked(client.getShare).mockResolvedValue(LOCKED_VIEW);
  vi.mocked(client.unlockShare).mockRejectedValue(
    new client.ApiError(401, "Invalid password"),
  );
  const user = userEvent.setup();
  renderAt();

  await user.type(await screen.findByLabelText(/password/i), "bad");
  await user.click(screen.getByRole("button", { name: /unlock/i }));

  expect(await screen.findByText(/invalid password/i)).toBeInTheDocument();
});
