import { HttpError } from "./errors";

/**
 * Parse `Authorization` for a single Bearer token.
 * - Scheme is case-insensitive (`Bearer` / `bearer` / `BEARER`)
 * - Leading/trailing header whitespace and extra spaces after the scheme are trimmed (format only)
 * - Token bytes are not otherwise normalized
 * - Empty token, unsupported schemes, or combined/multi-value headers → null
 */
export function parseBearerToken(authorizationHeader: string): string | null {
  const trimmed = authorizationHeader.trim();
  // Combined / repeated Authorization values are commonly joined with ", ".
  if (trimmed.includes(",")) {
    return null;
  }

  const match = /^([A-Za-z]+)\s+(.*)$/.exec(trimmed);
  if (match === null) {
    return null;
  }

  const scheme = match[1]!;
  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }

  // Allow extra spaces between scheme and token; do not alter the token further.
  const token = match[2]!.trimStart();
  if (token.length === 0) {
    return null;
  }

  return token;
}

/** Constant-time compare of equal-length byte arrays (no early exit on mismatch). */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.byteLength, b.byteLength);
  let mismatch = a.byteLength === b.byteLength ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

/**
 * Timing-safe string compare: SHA-256 both sides, then constant-time digest compare.
 * Avoids naive `===` and secret-length early returns. Uses Web Crypto `digest`
 * (available in Workers); does not rely on `subtle.timingSafeEqual` (absent in some runtimes).
 */
async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(aDigest), new Uint8Array(bDigest));
}

/**
 * Require `Authorization: Bearer <CAPTURE_API_TOKEN>`.
 * Sanitized failures: callers must map to 401 + WWW-Authenticate without leaking why.
 * Missing server token: fail closed before body parse; log only `AUTH_CONFIGURATION_MISSING`.
 */
export async function requireCaptureApiToken(
  request: Request,
  captureApiToken: string | undefined,
): Promise<void> {
  if (captureApiToken === undefined || captureApiToken.length === 0) {
    console.error("AUTH_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  const header = request.headers.get("Authorization");
  if (header === null) {
    throw new HttpError("UNAUTHORIZED", "Unauthorized");
  }

  const presented = parseBearerToken(header);
  if (presented === null) {
    throw new HttpError("UNAUTHORIZED", "Unauthorized");
  }

  const ok = await timingSafeEqualString(presented, captureApiToken);
  if (!ok) {
    throw new HttpError("UNAUTHORIZED", "Unauthorized");
  }
}
