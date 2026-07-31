import type { Env } from "./env";
import { errorResponse, HttpError } from "./errors";
import { createRequestId, withRequestId } from "./requestId";
import { handleHealth } from "./routes/health";
import { handleIngestTurns } from "./routes/v1/turns";

/**
 * Worker entry — ingest + authentication slices.
 *
 * Goals: authenticate POST /v1/turns → accept upload → validate → respond.
 * Leave D1 for later roadmap steps. No database writes yet.
 * Durable queue remains Capture Client v1 (extension), not here.
 */
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

      if (pathname === "/v1/turns") {
        // Request ID is created before authentication (and before body access).
        const requestId = createRequestId();
        try {
          return withRequestId(await handleIngestTurns(request, env), requestId);
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
