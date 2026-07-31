import { errorResponse, HttpError } from "./errors";
import { handleHealth } from "./routes/health";
import { handleIngestTurns } from "./routes/v1/turns";

/**
 * Worker entry — ingest skeleton slice.
 *
 * Goals (modest): accept upload → validate structure → success/error responses.
 * Leave auth and D1 for later roadmap steps. No database writes yet.
 * Durable queue remains Capture Client v1 (extension), not here.
 */
export default {
  async fetch(request: Request): Promise<Response> {
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
        return await handleIngestTurns(request);
      }

      throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
