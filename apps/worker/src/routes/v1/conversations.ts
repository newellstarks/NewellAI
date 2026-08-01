import type {
  ConversationsResponse,
  ConversationTurnsResponse,
} from "@newellai/contracts";
import { requireCaptureApiToken } from "../../auth";
import { listConversations, listConversationTurns } from "../../db/reads";
import type { Env } from "../../env";
import { HttpError, jsonResponse } from "../../errors";

/**
 * Read endpoints (FR-F6, docs/API.md — Read endpoints):
 * GET /v1/conversations           — summaries only, no turn content
 * GET /v1/conversations/:id/turns — ordered turns for one conversation
 *
 * Authentication happens before any D1 access. No pagination in Phase 1.
 * Caller creates X-Request-Id before invoking these handlers.
 */

export async function handleListConversations(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /v1/conversations");
  }

  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);

  const conversations = await listConversations(env.DB);
  const response: ConversationsResponse = {
    conversations,
    server_time: new Date().toISOString(),
  };
  return jsonResponse(response, 200);
}

export async function handleConversationTurns(
  request: Request,
  env: Env,
  conversationId: string,
): Promise<Response> {
  if (request.method !== "GET") {
    throw new HttpError(
      "METHOD_NOT_ALLOWED",
      "Use GET for /v1/conversations/:id/turns",
    );
  }

  await requireCaptureApiToken(request, env.CAPTURE_API_TOKEN);

  const turns = await listConversationTurns(env.DB, conversationId);
  const response: ConversationTurnsResponse = {
    conversation_id: conversationId,
    turns,
    server_time: new Date().toISOString(),
  };
  return jsonResponse(response, 200);
}
