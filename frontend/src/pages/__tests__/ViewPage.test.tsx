import { render, screen, within } from "@testing-library/react";
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

// The backend serializes naive UTC (models.py strips tzinfo), so fixtures use
// that exact shape — the provenance rail's date handling depends on it.
const CREATED_AT = "2026-07-31T04:47:45.237444";

const PUBLIC_VIEW = {
  slug: "abc",
  content: "# Public Doc",
  has_password: false,
  expires_at: null,
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
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

// ---- provenance rail --------------------------------------------------------
// The rail is the redesign's central claim: it tells a reader where a share
// came from and who can open it. A wrong value here is a misstatement about
// the record, so each field is asserted in both of its states.

async function findRail() {
  return within(
    await screen.findByRole("complementary", { name: /record details/i }),
  );
}

test("rail reports a public, unencrypted share", async () => {
  vi.mocked(client.getShare).mockResolvedValue(PUBLIC_VIEW);
  renderAt();
  const rail = await findRail();

  expect(rail.getByText("Public link")).toBeInTheDocument();
  expect(rail.getByText("Plaintext")).toBeInTheDocument();
  expect(rail.getByText("Never")).toBeInTheDocument();
});

test("rail formats the created date rather than failing to parse it", async () => {
  vi.mocked(client.getShare).mockResolvedValue(PUBLIC_VIEW);
  renderAt();
  const rail = await findRail();

  // Locale-independent: the year must survive, and the naive-UTC timestamp
  // must not degrade to the unparseable fallback.
  expect(rail.getByText(/2026/)).toBeInTheDocument();
  expect(rail.queryByText("Unknown")).not.toBeInTheDocument();
});

test("rail formats an offset-form timestamp instead of giving up on it", async () => {
  // Timestamps are naive UTC today, but making models.py timezone-aware would
  // emit "+00:00" — which must not silently turn every rail date into Unknown.
  vi.mocked(client.getShare).mockResolvedValue({
    ...PUBLIC_VIEW,
    created_at: "2026-07-31T04:47:45.237444+00:00",
  });
  renderAt();
  const rail = await findRail();

  expect(rail.getByText(/2026/)).toBeInTheDocument();
  expect(rail.queryByText("Unknown")).not.toBeInTheDocument();
});

test("rail states dates in UTC so viewers in different zones agree", async () => {
  // 23:30 UTC is the previous day in the Americas; the rail is a record, so it
  // must not shift with the reader's timezone.
  vi.mocked(client.getShare).mockResolvedValue({
    ...PUBLIC_VIEW,
    created_at: "2026-07-31T23:30:00.000000",
  });
  renderAt();
  const rail = await findRail();

  expect(rail.getByText(/31 Jul 2026 UTC/)).toBeInTheDocument();
});

test("rail reports an expiry date when the share has one", async () => {
  vi.mocked(client.getShare).mockResolvedValue({
    ...PUBLIC_VIEW,
    expires_at: "2027-01-09T10:00:00.000000",
  });
  renderAt();
  const rail = await findRail();

  expect(rail.getByText(/2027/)).toBeInTheDocument();
  expect(rail.queryByText("Never")).not.toBeInTheDocument();
});

test("rail reports AES-256-GCM for an encrypted share", async () => {
  const key = generateKey();
  const envelope = await encrypt("# Encrypted Doc", key);
  window.location.hash = "#k=" + keyToB64url(key);
  vi.mocked(client.getShare).mockResolvedValue(encryptedView(envelope));
  renderAt();
  const rail = await findRail();

  expect(rail.getByText("AES-256-GCM")).toBeInTheDocument();
  expect(rail.queryByText("Plaintext")).not.toBeInTheDocument();
});

test("rail reports password access once an unlocked share is shown", async () => {
  vi.mocked(client.getShare).mockResolvedValue(LOCKED_VIEW);
  vi.mocked(client.unlockShare).mockResolvedValue({ content: "# Secret Doc" });
  const user = userEvent.setup();
  renderAt();

  await user.type(await screen.findByLabelText(/password/i), "pw");
  await user.click(screen.getByRole("button", { name: /unlock/i }));
  await screen.findByRole("heading", { name: "Secret Doc" });
  const rail = await findRail();

  expect(rail.getByText("Password")).toBeInTheDocument();
  expect(rail.queryByText("Public link")).not.toBeInTheDocument();
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
