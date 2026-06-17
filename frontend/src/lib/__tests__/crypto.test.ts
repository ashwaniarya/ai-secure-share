/**
 * Tests for the shared envelope crypto core (TypeScript side).
 *
 * Covers round-trip correctness, envelope detection, URL-hash key parsing, and
 * a cross-language INTEROP check. The INTEROP constants below are EMBEDDED
 * copies of `skill/ai-response-share/tests/interop_vector.json` (do not read
 * across dirs) — they must stay byte-identical to that file.
 */

import { describe, expect, it } from "vitest";

import {
  b64urlEncode,
  b64urlToBytes,
  decrypt,
  encrypt,
  generateKey,
  isEncrypted,
  keyToB64url,
  parseKeyFromHash,
} from "../crypto";

// --- canonical interop vector (mirror of interop_vector.json) ---------------
const VECTOR = {
  key_b64url: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  iv_b64url: "ZGVmZ2hpamtsbW5v",
  plaintext: "# Secret\nhello world 🔐",
  envelope:
    "arsenc.1.ZGVmZ2hpamtsbW5v.azuNAxqbM-o0CjqEtgpKii2wam6rnGzmN0GGDXgioyLi7ewWvxioJV4",
};

describe("round-trip", () => {
  it("decrypts what it encrypts (ascii)", async () => {
    const key = generateKey();
    const plaintext = "hello world";
    expect(await decrypt(await encrypt(plaintext, key), key)).toBe(plaintext);
  });

  it("decrypts what it encrypts (multibyte unicode)", async () => {
    const key = generateKey();
    const plaintext = "# Heading\nUnicode: 🔐 café — 日本語";
    expect(await decrypt(await encrypt(plaintext, key), key)).toBe(plaintext);
  });

  it("round-trips the empty string", async () => {
    const key = generateKey();
    expect(await decrypt(await encrypt("", key), key)).toBe("");
  });

  it("uses a fresh IV per call (different envelopes for same input)", async () => {
    const key = generateKey();
    const first = await encrypt("same input", key);
    const second = await encrypt("same input", key);
    expect(first).not.toBe(second);
  });

  it("generates 32-byte keys", () => {
    expect(generateKey().length).toBe(32);
  });
});

describe("isEncrypted", () => {
  it("is true for a produced envelope", async () => {
    const key = generateKey();
    expect(isEncrypted(await encrypt("secret", key))).toBe(true);
  });

  it("is true for a bare prefix", () => {
    expect(isEncrypted("arsenc.1.aa.bb")).toBe(true);
  });

  it.each(["plain text", "# Markdown", "", "arsen", " arsenc.1.x.y"])(
    "is false for plaintext %j",
    (content) => {
      expect(isEncrypted(content)).toBe(false);
    },
  );
});

describe("b64url", () => {
  it.each([
    new Uint8Array([]),
    new Uint8Array([0x66]), // 'f'  -> 2 pad
    new Uint8Array([0x66, 0x6f]), // 'fo' -> 1 pad
    new Uint8Array([0x66, 0x6f, 0x6f]), // 'foo' -> 0 pad
    Uint8Array.from({ length: 256 }, (_v, i) => i), // full byte range
  ])("round-trips bytes of length %#", (raw) => {
    const encoded = b64urlEncode(raw);
    expect(encoded).not.toContain("=");
    expect(Array.from(b64urlToBytes(encoded))).toEqual(Array.from(raw));
  });

  it("uses the url-safe alphabet (no + or /)", () => {
    const encoded = b64urlEncode(new Uint8Array([0xfb, 0xff, 0xfe]));
    expect(encoded).not.toMatch(/[+/]/);
  });

  it("round-trips a key through keyToB64url", () => {
    const key = generateKey();
    expect(Array.from(b64urlToBytes(keyToB64url(key)))).toEqual(Array.from(key));
  });
});

describe("parseKeyFromHash", () => {
  it("parses a full hash with leading #", () => {
    const result = parseKeyFromHash(`#k=${VECTOR.key_b64url}`);
    expect(result).not.toBeNull();
    expect(keyToB64url(result!)).toBe(VECTOR.key_b64url);
  });

  it("parses a bare fragment body without #", () => {
    const result = parseKeyFromHash(`k=${VECTOR.key_b64url}`);
    expect(keyToB64url(result!)).toBe(VECTOR.key_b64url);
  });

  it("finds k among other params", () => {
    const result = parseKeyFromHash(`#tab=raw&k=${VECTOR.key_b64url}&theme=dark`);
    expect(keyToB64url(result!)).toBe(VECTOR.key_b64url);
  });

  it("returns null when no k param present", () => {
    expect(parseKeyFromHash("#tab=raw&theme=dark")).toBeNull();
  });

  it("returns null for an empty hash", () => {
    expect(parseKeyFromHash("")).toBeNull();
  });
});

describe("malformed envelope", () => {
  it("rejects plaintext", async () => {
    await expect(decrypt("not an envelope", generateKey())).rejects.toThrow();
  });

  it("rejects wrong field count", async () => {
    await expect(decrypt("arsenc.1.onlyiv", generateKey())).rejects.toThrow();
  });

  it("rejects unsupported version", async () => {
    await expect(decrypt("arsenc.2.ZGVm.YWJj", generateKey())).rejects.toThrow();
  });
});

describe("INTEROP (cross-language)", () => {
  it("decrypts the canonical vector produced by the Python side", async () => {
    const key = b64urlToBytes(VECTOR.key_b64url);
    expect(await decrypt(VECTOR.envelope, key)).toBe(VECTOR.plaintext);
  });

  it("detects the canonical vector as encrypted", () => {
    expect(isEncrypted(VECTOR.envelope)).toBe(true);
  });
});
