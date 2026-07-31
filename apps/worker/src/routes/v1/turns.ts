import type { UploadRequest, UploadResponse } from "@newellai/contracts";
import { HttpError, jsonResponse } from "../../errors";
import { parseUploadRequest } from "../../validate/uploadRequest";

/**
 * POST /v1/turns — modest ingest surface:
 * 1. Accept an upload request
 * 2. Validate its structure (wire protocol)
 * 3. Return UploadResponse / ApiError
 *
 * Do not write to the database in this slice.
 */
export async function handleIngestTurns(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use POST for /v1/turns");
  }

  // TODO(auth): Authenticate the caller before accepting uploads.
  // See roadmap step "Authentication" — shared-secret or better; do not hard-code identity.

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError("INVALID_JSON", "Request body must be valid JSON");
  }

  const upload: UploadRequest = parseUploadRequest(raw);

  // TODO(d1): Persist turns idempotently (client_turn_id) and set `duplicate` from real writes.
  // TODO(durable-upload): Replace skeleton counts with durable upload results.
  // Do not write to the database yet — keep a clean, testable API surface first.

  const response: UploadResponse = {
    accepted: upload.turns.length,
    duplicate: 0,
    conversation_id: upload.conversation.conversation_id,
    server_time: new Date().toISOString(),
  };

  return jsonResponse(response, 200);
}
