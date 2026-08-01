import type { UploadRequest, UploadResponse } from "@newellai/contracts";
import { requireCaptureApiToken } from "../../auth";
import { persistUpload } from "../../db/turns";
import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";
import { parseUploadRequest } from "../../validate/uploadRequest";

/**
 * POST /v1/turns — authenticated, persisted ingest (docs/Database.md):
 * 1. Authenticate (Bearer / CAPTURE_API_TOKEN) before reading the body
 * 2. Validate upload structure (wire protocol)
 * 3. Persist conversation + turns to D1 (idempotent on client_turn_id)
 * 4. Return UploadResponse with real accepted/duplicate counts
 *
 * No queue logic, no retries — clients retry against the idempotent path.
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

  const { accepted, duplicate } = await persistUpload(env.DB, upload);

  const response: UploadResponse = {
    accepted,
    duplicate,
    conversation_id: upload.conversation.conversation_id,
    server_time: new Date().toISOString(),
  };

  return jsonResponse(response, 200);
}
