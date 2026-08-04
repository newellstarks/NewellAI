import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";
import {
  isPairingConsumed,
  markPairingConsumed,
} from "../../pairingState";

/**
 * Local-only Capture Client pairing (docs/CaptureClient.md Slice 2.1).
 * POST /v1/dev/pair — no Bearer; loopback + env gates + exact extension Origin.
 * Never logs the token or response body.
 */

function pairingEnabled(env: Env): boolean {
  return env.ALLOW_LOCAL_PAIRING === "true";
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function expectedOrigin(env: Env): string | null {
  const raw = env.PAIRING_EXTENSION_ORIGIN;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(trimmed)) return null;
  return trimmed;
}

function requestOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin === null || origin.length === 0) return null;
  if (origin === "null") return null;
  return origin;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "0",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

/**
 * Handle OPTIONS / POST for /v1/dev/pair.
 * Returns null when this module should not handle the path.
 */
export async function handleDevPair(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/v1/dev/pair") return null;

  // Unavailable unless explicitly enabled — looks like no route in production.
  if (!pairingEnabled(env)) {
    throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
  }

  const url = new URL(request.url);
  if (!isLoopbackHost(url.hostname)) {
    throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
  }

  const allowed = expectedOrigin(env);
  if (allowed === null) {
    throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
  }

  const origin = requestOrigin(request);
  if (origin === null || origin !== allowed) {
    throw new HttpError("FORBIDDEN", "Pairing origin not allowed");
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(allowed) });
  }

  if (request.method !== "POST") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use POST for /v1/dev/pair");
  }

  if (isPairingConsumed()) {
    throw new HttpError("FORBIDDEN", "Pairing window closed");
  }

  const token = env.CAPTURE_API_TOKEN;
  if (typeof token !== "string" || token.length === 0) {
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  markPairingConsumed();

  return jsonResponse(
    { token },
    200,
    corsHeaders(allowed),
  );
}
