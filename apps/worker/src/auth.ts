import { HttpError } from "./errors";
import {
  RECALL_SESSION_COOKIE,
  recallSessionValid,
} from "./recall/sessionState";

/**
 * Auth scopes:
 * - capture_full: Bearer CAPTURE_API_TOKEN (ingest + artifact writes + reads)
 * - recall_read: Recall session cookie (GET Recall read APIs only)
 */
export type AuthScope = "capture_full" | "recall_read";

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

/** Read a single cookie value by name (first match). */
export function parseCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (cookieHeader === null || cookieHeader.length === 0) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    return trimmed.slice(eq + 1).trim();
  }
  return null;
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

async function bearerIsCaptureToken(
  request: Request,
  captureApiToken: string,
): Promise<boolean> {
  const header = request.headers.get("Authorization");
  if (header === null) return false;
  const presented = parseBearerToken(header);
  if (presented === null) return false;
  return timingSafeEqualString(presented, captureApiToken);
}

async function cookieIsRecallSession(request: Request): Promise<boolean> {
  const raw = parseCookieValue(
    request.headers.get("Cookie"),
    RECALL_SESSION_COOKIE,
  );
  if (raw === null) return false;
  return recallSessionValid(raw);
}

/**
 * Authenticate with the required minimum scope.
 * Returns the granted scope (`capture_full` preferred when both present).
 */
export async function requireAuth(
  request: Request,
  captureApiToken: string | undefined,
  required: AuthScope,
): Promise<AuthScope> {
  if (captureApiToken === undefined || captureApiToken.length === 0) {
    console.error("AUTH_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  if (await bearerIsCaptureToken(request, captureApiToken)) {
    return "capture_full";
  }

  if (required === "recall_read" && (await cookieIsRecallSession(request))) {
    return "recall_read";
  }

  throw new HttpError("UNAUTHORIZED", "Unauthorized");
}

/**
 * Require `Authorization: Bearer <CAPTURE_API_TOKEN>` (capture_full).
 * Sanitized failures: callers must map to 401 + WWW-Authenticate without leaking why.
 */
export async function requireCaptureApiToken(
  request: Request,
  captureApiToken: string | undefined,
): Promise<void> {
  await requireAuth(request, captureApiToken, "capture_full");
}

/** Require capture_full or recall_read for GET Recall/read APIs. */
export async function requireRecallRead(
  request: Request,
  captureApiToken: string | undefined,
): Promise<AuthScope> {
  return requireAuth(request, captureApiToken, "recall_read");
}
