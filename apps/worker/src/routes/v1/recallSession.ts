import { parseCookieValue } from "../../auth";
import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";
import {
  createRecallSession,
  RECALL_SESSION_COOKIE,
  RECALL_SESSION_MAX_AGE_SEC,
  revokeRecallSession,
} from "../../recall/sessionState";

/**
 * Local-only Desktop Recall session mint/revoke.
 * POST /v1/dev/recall/session
 * POST /v1/dev/recall/session/revoke
 *
 * Never returns CAPTURE_API_TOKEN. Never logs cookie values.
 */

function pairingEnabled(env: Env): boolean {
  return env.ALLOW_LOCAL_PAIRING === "true";
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function setCookieHeader(raw: string): string {
  return `${RECALL_SESSION_COOKIE}=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${RECALL_SESSION_MAX_AGE_SEC}`;
}

function clearCookieHeader(): string {
  return `${RECALL_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

/**
 * Handle Recall session routes. Returns null when path is not handled here.
 */
export async function handleRecallSession(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const isMint = pathname === "/v1/dev/recall/session";
  const isRevoke = pathname === "/v1/dev/recall/session/revoke";
  if (!isMint && !isRevoke) return null;

  if (!pairingEnabled(env)) {
    throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
  }

  const url = new URL(request.url);
  if (!isLoopbackHost(url.hostname)) {
    throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
  }

  if (request.method !== "POST") {
    throw new HttpError(
      "METHOD_NOT_ALLOWED",
      isMint
        ? "Use POST for /v1/dev/recall/session"
        : "Use POST for /v1/dev/recall/session/revoke",
    );
  }

  if (isRevoke) {
    const raw = parseCookieValue(
      request.headers.get("Cookie"),
      RECALL_SESSION_COOKIE,
    );
    if (raw !== null) await revokeRecallSession(raw);
    return jsonResponse(
      { ok: true },
      200,
      {
        "Cache-Control": "no-store",
        "Set-Cookie": clearCookieHeader(),
      },
    );
  }

  const capture = env.CAPTURE_API_TOKEN;
  if (typeof capture !== "string" || capture.length === 0) {
    console.error("AUTH_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  const raw = await createRecallSession();
  return jsonResponse(
    { ok: true },
    200,
    {
      "Cache-Control": "no-store",
      "Set-Cookie": setCookieHeader(raw),
    },
  );
}
