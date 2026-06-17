/**
 * Zero-knowledge envelope cryptography for shared AI responses (browser side).
 *
 * This is the TypeScript half of a shared crypto core. Its Python twin
 * (`skill/ai-response-share/scripts/crypto.py`) MUST produce and consume the
 * EXACT same envelope format, so each side can read what the other wrote.
 *
 * Envelope format (version 1):
 *
 *     arsenc.1.<b64url(iv)>.<b64url(ciphertext_with_tag)>
 *
 * - Cipher: AES-256-GCM (AEAD). Key is 32 random bytes; iv/nonce is 12 random
 *   bytes, fresh per encryption. No associated data (AAD).
 * - AES-GCM (WebCrypto) already appends the 16-byte auth tag to the ciphertext,
 *   so we store `ciphertext_with_tag` as-is and hand the whole blob back to
 *   decrypt with the 12-byte iv.
 * - `b64url` is base64url WITHOUT `=` padding. Decoders re-add padding.
 * - Plaintext is UTF-8. The `arsenc.` prefix is the detection marker; `1` is
 *   the format version.
 *
 * Uses `globalThis.crypto.subtle`, which is available in browsers and in the
 * Node-backed test environment (see `frontend/src/test/setup.ts`).
 */

// Envelope wire constants. Kept in lockstep with crypto.py.
const ENVELOPE_PREFIX = "arsenc.";
const ENVELOPE_VERSION = "1";
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

/** Encode bytes as base64url WITHOUT padding (binary-safe via btoa). */
export function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode an unpadded base64url string back to bytes, re-adding padding. */
export function b64urlToBytes(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Return a fresh 32-byte AES-256 key from the platform CSPRNG. */
export function generateKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(KEY_LENGTH_BYTES));
}

/** Render a raw key as an unpadded base64url string (e.g. for URLs). */
export function keyToB64url(key: Uint8Array): string {
  return b64urlEncode(key);
}

/**
 * Report whether a share-content string is an encrypted envelope.
 * Detection is purely the `arsenc.` prefix; anything else is plaintext.
 */
export function isEncrypted(content: string): boolean {
  return content.startsWith(ENVELOPE_PREFIX);
}

/**
 * Copy bytes into a fresh `ArrayBuffer`-backed view.
 *
 * WebCrypto APIs want a `BufferSource` whose buffer is a plain `ArrayBuffer`.
 * In recent TS lib types a bare `Uint8Array` is `Uint8Array<ArrayBufferLike>`
 * (which admits `SharedArrayBuffer`) and is rejected. Re-wrapping guarantees a
 * narrow `ArrayBuffer` and avoids per-call type casts.
 */
function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

/** Import raw key bytes as a non-extractable AES-GCM CryptoKey. */
async function importAesKey(
  key: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    toBufferSource(key),
    { name: "AES-GCM" },
    false,
    [usage],
  );
}

/**
 * Encrypt UTF-8 `plaintext` under `key` into a version-1 envelope.
 * Generates a fresh random 12-byte IV per call. Returns the envelope string.
 */
export async function encrypt(plaintext: string, key: Uint8Array): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const cryptoKey = await importAesKey(key, "encrypt");
  const plaintextBytes = new TextEncoder().encode(plaintext);
  // WebCrypto AES-GCM appends the 16-byte tag to the ciphertext automatically.
  const ciphertextWithTag = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      toBufferSource(plaintextBytes),
    ),
  );
  return [
    ENVELOPE_PREFIX + ENVELOPE_VERSION,
    b64urlEncode(iv),
    b64urlEncode(ciphertextWithTag),
  ].join(".");
}

/**
 * Decrypt a version-1 envelope produced by `encrypt` (or its Python twin).
 * Validates prefix/version/structure and returns the UTF-8 plaintext.
 *
 * @throws Error on a malformed envelope (bad prefix, wrong version, wrong
 *   field count, or invalid base64url).
 */
export async function decrypt(envelope: string, key: Uint8Array): Promise<string> {
  if (!isEncrypted(envelope)) {
    throw new Error("Not an encrypted envelope: missing 'arsenc.' prefix");
  }

  // Split into exactly: header ("arsenc.1"), iv, ciphertext+tag.
  const parts = envelope.split(".");
  if (parts.length !== 4) {
    throw new Error("Malformed envelope: expected 'arsenc.<ver>.<iv>.<ct>'");
  }

  const [, version, ivB64, ciphertextB64] = parts;
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version: ${version}`);
  }

  let iv: Uint8Array;
  let ciphertextWithTag: Uint8Array;
  try {
    iv = b64urlToBytes(ivB64);
    ciphertextWithTag = b64urlToBytes(ciphertextB64);
  } catch {
    throw new Error("Malformed envelope: invalid base64url");
  }

  const cryptoKey = await importAesKey(key, "decrypt");
  const plaintextBytes = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBufferSource(iv) },
    cryptoKey,
    toBufferSource(ciphertextWithTag),
  );
  return new TextDecoder().decode(plaintextBytes);
}

/**
 * Pull the base64url key out of a URL hash fragment, if present.
 *
 * Defaults to `window.location.hash`. Accepts a leading `#`, the bare fragment
 * body, and extra `&`-separated params; only the `k` param is returned.
 *
 * @returns Raw key bytes, or `null` if no `k` param is found.
 */
export function parseKeyFromHash(hash?: string): Uint8Array | null {
  const raw =
    hash ??
    (typeof window !== "undefined" && window.location ? window.location.hash : "");
  const fragment = raw.startsWith("#") ? raw.slice(1) : raw;

  for (const param of fragment.split("&")) {
    const match = /^k=(.+)$/.exec(param);
    if (match) {
      return b64urlToBytes(match[1]);
    }
  }
  return null;
}
