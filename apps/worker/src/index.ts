import type { Env } from "./env";
import { errorResponse, HttpError } from "./errors";
import { createRequestId, withRequestId } from "./requestId";
import { handleHealth } from "./routes/health";
import {
  handleConversationTurns,
  handleListConversations,
} from "./routes/v1/conversations";
import { handleIngestTurns } from "./routes/v1/turns";

const CONVERSATION_TURNS_RE = /^\/v1\/conversations\/([^/]+)\/turns$/;

/**
 * Worker entry — ingest + authentication + D1 persistence + read slices.
 *
 * POST /v1/turns                  — authenticated, idempotent ingest to D1
 * GET  /v1/conversations          — authenticated conversation summaries
 * GET  /v1/conversations/:id/turns — authenticated ordered turns
 *
 * Durable queue remains Capture Client v1 (extension), not here.
 */
async function routeV1(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  if (pathname === "/v1/turns") {
    return handleIngestTurns(request, env);
  }
  if (pathname === "/v1/conversations") {
    return handleListConversations(request, env);
  }
  const turnsMatch = CONVERSATION_TURNS_RE.exec(pathname);
  if (turnsMatch !== null) {
    return handleConversationTurns(
      request,
      env,
      decodeURIComponent(turnsMatch[1]!),
    );
  }
  throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === "/health") {
        if (request.method !== "GET") {
          throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /health");
        }
        return handleHealth();
      }

      if (pathname.startsWith("/v1/")) {
        // Request ID is created before authentication (and before body access).
        const requestId = createRequestId();
        try {
          return withRequestId(await routeV1(request, env, pathname), requestId);
        } catch (error) {
          return withRequestId(errorResponse(error), requestId);
        }
      }

      throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
