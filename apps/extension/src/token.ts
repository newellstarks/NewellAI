/**
 * Capture API token validation (HTTP Authorization header safety).
 *
 * Rule: after trim, the token must be non-empty printable ASCII only
 * (U+0020–U+007E). Control characters (including CR/LF), non-ASCII, and
 * non-printable characters are rejected wholesale — interior characters are
 * never silently altered or stripped.
 */

export const INVALID_TOKEN_MESSAGE =
  "invalid token characters — re-enter token";

export const TOKEN_STORAGE_MISMATCH_MESSAGE =
  "token storage verification failed — re-enter token";

export type TokenValidation =
  | { ok: true; token: string }
  | { ok: false; message: string };

/** Trim edges, then accept only printable ASCII. Reject otherwise. */
export function validateCaptureToken(raw: string): TokenValidation {
  const token = raw.trim();
  if (token.length === 0) {
    return { ok: false, message: INVALID_TOKEN_MESSAGE };
  }
  for (let i = 0; i < token.length; i += 1) {
    const code = token.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      return { ok: false, message: INVALID_TOKEN_MESSAGE };
    }
  }
  return { ok: true, token };
}

/** SHA-256 hex fingerprint for identity checks — never display the token. */
export async function fingerprintToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
