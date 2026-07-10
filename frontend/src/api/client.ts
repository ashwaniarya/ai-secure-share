/**
 * Typed wrapper around the AI Response Share HTTP API.
 *
 * Uses same-origin "/api/..." paths by default (the dev server proxies these to
 * the backend; in production FastAPI serves both). Set VITE_API_BASE_URL to
 * point at a different origin.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface CreatedShare {
  slug: string;
  manage_token: string;
  url: string;
  expires_at: string | null;
}

export interface ShareView {
  slug: string;
  content: string | null;
  has_password: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateShareInput {
  content: string;
  password?: string;
  expires_in_seconds?: number | null;
}

export interface UpdateShareInput {
  content?: string;
  password?: string | null;
  expires_in_seconds?: number | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.detail === "string") return data.detail;
  } catch {
    // fall through to the generic message
  }
  return response.statusText || `Request failed (${response.status})`;
}

/**
 * Guarantee an absolute URL. A scheme-less value like "airesponseshare.com/s/x"
 * used as an `<a href>` is resolved *relative* to the current page by every
 * browser (the WHATWG URL standard), producing a doubled host
 * ("https://host/airesponseshare.com/s/x"). Prefix a scheme so share links are
 * always absolute. Already-absolute, protocol-relative, and root-relative URLs
 * pass through unchanged (only a scheme-less host is at risk of doubling).
 */
export function ensureAbsoluteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed; // has a scheme
  if (trimmed.startsWith("//")) return `https:${trimmed}`; // protocol-relative
  if (trimmed.startsWith("/")) return trimmed; // root-relative resolves correctly
  return `https://${trimmed}`; // scheme-less host — the doubling case
}

export async function createShare(
  input: CreateShareInput,
): Promise<CreatedShare> {
  const result = await request<CreatedShare>("/api/shares", {
    method: "POST",
    body: input,
  });
  return { ...result, url: ensureAbsoluteUrl(result.url) };
}

export function getShare(slug: string, token?: string): Promise<ShareView> {
  return request<ShareView>(`/api/shares/${encodeURIComponent(slug)}`, { token });
}

export function unlockShare(
  slug: string,
  password: string,
): Promise<{ content: string }> {
  return request<{ content: string }>(
    `/api/shares/${encodeURIComponent(slug)}/unlock`,
    { method: "POST", body: { password } },
  );
}

export function updateShare(
  slug: string,
  token: string,
  patch: UpdateShareInput,
): Promise<ShareView> {
  return request<ShareView>(`/api/shares/${encodeURIComponent(slug)}`, {
    method: "PUT",
    token,
    body: patch,
  });
}

export function deleteShare(slug: string, token: string): Promise<void> {
  return request<void>(`/api/shares/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    token,
  });
}
