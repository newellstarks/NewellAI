import { describe, expect, it } from "vitest";
import {
  INVALID_TOKEN_MESSAGE,
  validateCaptureToken,
} from "./token";

describe("validateCaptureToken", () => {
  it("accepts a valid printable ASCII token (after trim)", () => {
    const result = validateCaptureToken("  abcDEF0123-_+/=.~  ");
    expect(result).toEqual({ ok: true, token: "abcDEF0123-_+/=.~" });
  });

  it("trims trailing CR/LF from an otherwise valid token (clipboard paste)", () => {
    // Edge whitespace is trimmed; interior characters are never altered.
    expect(validateCaptureToken("good-token\r")).toEqual({
      ok: true,
      token: "good-token",
    });
    expect(validateCaptureToken("good-token\n")).toEqual({
      ok: true,
      token: "good-token",
    });
    expect(validateCaptureToken("good-token\r\n")).toEqual({
      ok: true,
      token: "good-token",
    });
  });

  it("rejects newline contamination inside the token", () => {
    const result = validateCaptureToken("good-token\nbad");
    expect(result).toEqual({ ok: false, message: INVALID_TOKEN_MESSAGE });
  });

  it("rejects carriage-return contamination inside the token", () => {
    const result = validateCaptureToken("good\rtoken");
    expect(result).toEqual({ ok: false, message: INVALID_TOKEN_MESSAGE });
  });

  it("rejects CR/LF pair contamination inside the token", () => {
    const result = validateCaptureToken("token\r\nvalue");
    expect(result.ok).toBe(false);
  });

  it("rejects non-ASCII characters", () => {
    expect(validateCaptureToken("caf\u00e9-token").ok).toBe(false);
    expect(validateCaptureToken("token-\u65e5\u672c\u8a9e").ok).toBe(false);
    expect(validateCaptureToken("tok\u00a0en").ok).toBe(false);
  });

  it("rejects other control characters without altering the interior", () => {
    const withTab = "ab\tc";
    expect(validateCaptureToken(withTab).ok).toBe(false);
    // Validation is reject-only: it does not return a silently cleaned token.
    expect(validateCaptureToken(withTab)).not.toEqual({
      ok: true,
      token: "abc",
    });
  });

  it("rejects empty / whitespace-only input", () => {
    expect(validateCaptureToken("").ok).toBe(false);
    expect(validateCaptureToken("   ").ok).toBe(false);
  });

  it("never includes the token value in the failure message", () => {
    const secret = "super-secret-value-with-\n-newline";
    const result = validateCaptureToken(secret);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(INVALID_TOKEN_MESSAGE);
      expect(result.message).not.toContain("super-secret");
      expect(result.message).not.toContain(secret);
    }
  });
});
