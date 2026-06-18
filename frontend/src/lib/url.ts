/**
 * URL helpers for turning server-provided share URLs into safe, clickable links.
 */

/**
 * Guarantee an absolute URL that carries an explicit scheme.
 *
 * Share URLs originate from the server's configured public base URL. When that
 * base URL is missing its scheme (e.g. "airesponseshare.com/s/abc"), a browser
 * treats it as a *relative* href and resolves it against the current page —
 * producing the duplicated-domain bug ("host/host/s/abc"). Forcing a scheme
 * keeps the link absolute and identical across every browser.
 *
 * Uses only plain string checks (no `URL` constructor / relative-resolution
 * quirks) so behavior is deterministic on every browser engine.
 */
export function toAbsoluteUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return trimmed;
  // Protocol-relative ("//host/path") — adopt https explicitly.
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  // Already absolute ("https://", "http://", "mailto:", …).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  // Bare host/path — make it absolute over https.
  return `https://${trimmed}`;
}
