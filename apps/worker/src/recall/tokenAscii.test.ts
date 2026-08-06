import { describe, expect, it } from "vitest";
import {
  buildAuthorizationHeader,
  normalizeToken,
} from "../../public/recall/token.js";

describe("Recall token ASCII validation", () => {
  it("accepts printable ASCII tokens and builds Bearer + SP + token", () => {
    const token = "a".repeat(64);
    const norm = normalizeToken(`  ${token}  `);
    expect(norm.ok).toBe(true);
    if (!norm.ok) return;
    expect(norm.token).toBe(token);
    const header = buildAuthorizationHeader(norm.token);
    expect(header.ok).toBe(true);
    if (!header.ok) return;
    expect(header.authorization).toBe(`Bearer ${token}`);
    expect(header.authorization.charCodeAt(6)).toBe(0x20);
    for (const ch of header.authorization) {
      expect(ch.charCodeAt(0)).toBeLessThanOrEqual(0x7e);
    }
  });

  it("rejects zero-width and other non-ASCII characters that break fetch headers", () => {
    const withZwsp = `abc\u200Bdef`;
    const norm = normalizeToken(withZwsp);
    expect(norm.ok).toBe(false);
    if (norm.ok) return;
    expect(norm.error.toLowerCase()).toContain("ascii");
    expect(JSON.stringify(norm)).not.toContain("\u200B");
  });

  it("rejects Unicode spaces that trim() does not remove from the middle", () => {
    const norm = normalizeToken("ab\u00a0cd");
    expect(norm.ok).toBe(false);
  });

  it("buildAuthorizationHeader rejects code points above 0xFF", () => {
    const header = buildAuthorizationHeader("ok\u2014bad");
    expect(header.ok).toBe(false);
  });
});
