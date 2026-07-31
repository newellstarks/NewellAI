import type { UploadRequest, UploadResponse } from "@newellai/contracts";
import { HttpError, jsonResponse } from "../../errors";
import { parseUploadRequest } from "../../validate/uploadRequest";

/**
 * POST /v1/turns — ingest skeleton.
 * Validates UploadRequest and returns UploadResponse without auth, persistence, or retries.
 */
export async function handleIngestTurns(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use POST for /v1/turns");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError("INVALID_JSON", "Request body must be valid JSON");
  }

  const upload: UploadRequest = parseUploadRequest(raw);

  // Skeleton only — no D1 write, no idempotent duplicate detection yet.
  const response: UploadResponse = {
    accepted: upload.turns.length,
    duplicate: 0,
    conversation_id: upload.conversation.conversation_id,
    server_time: new Date().toISOString(),
  };

  return jsonResponse(response, 200);
}
