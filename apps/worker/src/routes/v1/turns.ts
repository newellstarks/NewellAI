import type { UploadRequest, UploadResponse } from "@newellai/contracts";
import { requireCaptureApiToken } from "../../auth";
import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";
import { parseUploadRequest } from "../../validate/uploadRequest";

/**
 * POST /v1/turns — authenticated ingest surface:
 * 1. Authenticate (Bearer / CAPTURE_API_TOKEN) before reading the body
 * 2. Accept + validate upload structure (wire protocol)
 * 3. Return UploadResponse / ApiError
 *
 * Do not write to the database in this slice.
 * Caller creates X-Request-Id before invoking this handler.
 */
export async function handleIngestTurns(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use POST for /v1/turns");
  }

  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);

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
