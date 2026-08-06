import type { SearchResponse } from "@newellai/contracts";
import { requireRecallRead } from "../../auth";
import {
  parseSearchLimit,
  searchTurns,
  validateSearchQuery,
} from "../../db/search";
import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";

/**
 * GET /v1/search?q=&limit= — literal turn-text search (Desktop Recall v1).
 */

export async function handleSearch(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /v1/search");
  }

  await requireRecallRead(request, env.CAPTURE_API_TOKEN);

  const url = new URL(request.url);
  const query = validateSearchQuery(url.searchParams.get("q"));
  const limit = parseSearchLimit(url.searchParams.get("limit"));
  const hits = await searchTurns(env.DB, query, limit);

  const response: SearchResponse = {
    query,
    hits,
    server_time: new Date().toISOString(),
  };
  return jsonResponse(response, 200);
}
