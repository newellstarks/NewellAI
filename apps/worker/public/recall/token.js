/**
 * ASCII-safe Bearer token helpers for Desktop Recall.
 * Never log or return the token value in errors.
 */

/**
 * Trim surrounding whitespace, then require printable ASCII only (0x21-0x7E).
 * @param {string} raw
 * @returns {{ ok: true, token: string } | { ok: false, error: string }}
 */
export function normalizeToken(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "Token must be a string" };
  }
  const token = raw.trim();
  if (token.length === 0) {
    return { ok: false, error: "Enter a token" };
  }
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) {
      return {
        ok: false,
        error:
          "Token contains a non-printable or non-ASCII character (or ASCII space). Re-copy CAPTURE_API_TOKEN as plain ASCII.",
      };
    }
  }
  return { ok: true, token };
}

/**
 * Build Authorization header: "Bearer" + one ASCII space + token.
 * @param {string} token already normalized printable ASCII
 * @returns {{ ok: true, authorization: string } | { ok: false, error: string }}
 */
export function buildAuthorizationHeader(token) {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, error: "Token missing" };
  }
  const authorization = "Bearer" + " " + token;
  for (let i = 0; i < authorization.length; i++) {
    if (authorization.charCodeAt(i) > 0xff) {
      return {
        ok: false,
        error: "Authorization header would contain a non ISO-8859-1 character",
      };
    }
  }
  return { ok: true, authorization };
}
