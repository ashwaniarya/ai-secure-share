import { describe, expect, test } from "vitest";
import { toAbsoluteUrl } from "../url";

describe("toAbsoluteUrl", () => {
  test("prepends https:// to a scheme-less host so the link is not treated as relative", () => {
    // The duplicated-domain bug: without a scheme the browser resolves
    // "airesponseshare.com/s/abc" against the current page -> host/host/s/abc.
    expect(toAbsoluteUrl("airesponseshare.com/s/EBASTkuqVc8")).toBe(
      "https://airesponseshare.com/s/EBASTkuqVc8",
    );
  });

  test("preserves the #k= key fragment when adding a scheme", () => {
    expect(
      toAbsoluteUrl("airesponseshare.com/s/EBASTkuqVc8#k=Gjzoa4Sz4XmajYMp1X4Je6I2BtLLCLahv0SkMv71OAg"),
    ).toBe(
      "https://airesponseshare.com/s/EBASTkuqVc8#k=Gjzoa4Sz4XmajYMp1X4Je6I2BtLLCLahv0SkMv71OAg",
    );
  });

  test("leaves an https URL untouched", () => {
    expect(toAbsoluteUrl("https://airesponseshare.com/s/aB3x9")).toBe(
      "https://airesponseshare.com/s/aB3x9",
    );
  });

  test("leaves an http localhost URL untouched (dev)", () => {
    expect(toAbsoluteUrl("http://localhost:8000/s/abc")).toBe(
      "http://localhost:8000/s/abc",
    );
  });

  test("upgrades a protocol-relative URL to https", () => {
    expect(toAbsoluteUrl("//airesponseshare.com/s/abc")).toBe(
      "https://airesponseshare.com/s/abc",
    );
  });

  test("trims surrounding whitespace", () => {
    expect(toAbsoluteUrl("  airesponseshare.com/s/abc  ")).toBe(
      "https://airesponseshare.com/s/abc",
    );
  });
});
