import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createShare, deleteShare, getShare } from "../client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("createShare posts content to /api/shares and returns the result", async () => {
  fetchMock.mockResolvedValue(
    jsonResponse(
      { slug: "abc", manage_token: "t", url: "http://x/s/abc", expires_at: null },
      201,
    ),
  );

  const result = await createShare({ content: "# hi" });

  expect(result.slug).toBe("abc");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/shares");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ content: "# hi" });
});

test("getShare fetches the share view", async () => {
  fetchMock.mockResolvedValue(
    jsonResponse({
      slug: "abc",
      content: "# hi",
      has_password: false,
      expires_at: null,
      created_at: "x",
      updated_at: "y",
    }),
  );

  const view = await getShare("abc");

  expect(view.content).toBe("# hi");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/shares/abc");
});

test("getShare attaches a bearer token when provided", async () => {
  fetchMock.mockResolvedValue(
    jsonResponse({
      slug: "abc",
      content: "x",
      has_password: false,
      expires_at: null,
      created_at: "x",
      updated_at: "y",
    }),
  );

  await getShare("abc", "mytoken");

  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer mytoken");
});

test("throws ApiError carrying the HTTP status on failure", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: "gone" }, 410));

  await expect(getShare("abc")).rejects.toMatchObject({ status: 410 });
});

test("deleteShare sends DELETE with the manage token", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

  await deleteShare("abc", "tok");

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/shares/abc");
  expect(init.method).toBe("DELETE");
  expect(init.headers.Authorization).toBe("Bearer tok");
});
