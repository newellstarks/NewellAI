import type { ConversationSummary, Speaker, TurnRecord } from "@newellai/contracts";
import { HttpError } from "../errors";

/**
 * Read queries for the FR-F6 inspection endpoints (docs/API.md — Read endpoints).
 * Read-only; all SQL parameterized; callers authenticate before invoking.
 */

interface ConversationRow {
  conversation_id: string;
  user_id: string;
  title: string | null;
  source_model: string | null;
  started_at: string | null;
  created_at: string;
  last_turn_at: string | null;
  turn_count: number;
}

interface TurnRow {
  turn_id: string;
  conversation_id: string;
  client_turn_id: string;
  speaker: string;
  text: string;
  captured_at: string | null;
  sequence: number | null;
  parent_client_turn_id: string | null;
  message_type: string | null;
  topic: string | null;
  capture_client: string;
  capture_client_version: string | null;
  surface: string | null;
  captured_batch_id: string | null;
  created_at: string;
}

function requireDb(db: D1Database | undefined): D1Database {
  if (db === undefined) {
    console.error("DB_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }
  return db;
}

/**
 * All conversations reachable with the bearer token (Phase 1: one operator).
 * Summaries only — no turn content.
 *
 * LEFT JOIN: the non-transactional persistence path can leave a conversation
 * row without turns after a mid-write failure; the inspection API must expose
 * that condition (last_turn_at null, turn_count 0), not hide it.
 * Order: conversations with turns first (last_turn_at DESC), NULLs last,
 * then conversation_id ASC (deterministic).
 */
export async function listConversations(
  db: D1Database | undefined,
): Promise<ConversationSummary[]> {
  const { results } = await requireDb(db)
    .prepare(
      `SELECT c.conversation_id, c.user_id, c.title, c.source_model,
              c.started_at, c.created_at,
              MAX(t.created_at) AS last_turn_at,
              COUNT(t.turn_id) AS turn_count
         FROM conversations c
         LEFT JOIN turns t ON t.conversation_id = c.conversation_id
        GROUP BY c.conversation_id
        ORDER BY (last_turn_at IS NULL) ASC, last_turn_at DESC,
                 c.conversation_id ASC`,
    )
    .all<ConversationRow>();

  return results.map((row) => ({
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.source_model !== null ? { source_model: row.source_model } : {}),
    ...(row.started_at !== null ? { started_at: row.started_at } : {}),
    created_at: row.created_at,
    last_turn_at: row.last_turn_at,
    turn_count: row.turn_count,
  }));
}

/**
 * All stored turns for one conversation.
 * Order: sequence ASC with NULLs last, then created_at ASC, then turn_id ASC.
 * Unknown conversation → 404 NOT_FOUND.
 */
export async function listConversationTurns(
  db: D1Database | undefined,
  conversationId: string,
): Promise<TurnRecord[]> {
  const database = requireDb(db);

  const exists = await database
    .prepare("SELECT 1 AS one FROM conversations WHERE conversation_id = ?")
    .bind(conversationId)
    .first();
  if (exists === null) {
    throw new HttpError("NOT_FOUND", "Unknown conversation");
  }

  const { results } = await database
    .prepare(
      `SELECT turn_id, conversation_id, client_turn_id, speaker, text,
              captured_at, sequence, parent_client_turn_id, message_type, topic,
              capture_client, capture_client_version, surface, captured_batch_id,
              created_at
         FROM turns
        WHERE conversation_id = ?
        ORDER BY (sequence IS NULL) ASC, sequence ASC, created_at ASC, turn_id ASC`,
    )
    .bind(conversationId)
    .all<TurnRow>();

  return results.map((row) => ({
    turn_id: row.turn_id,
    conversation_id: row.conversation_id,
    client_turn_id: row.client_turn_id,
    speaker: row.speaker as Speaker,
    text: row.text,
    ...(row.captured_at !== null ? { captured_at: row.captured_at } : {}),
    ...(row.sequence !== null ? { sequence: row.sequence } : {}),
    ...(row.parent_client_turn_id !== null
      ? { parent_client_turn_id: row.parent_client_turn_id }
      : {}),
    ...(row.message_type !== null ? { message_type: row.message_type } : {}),
    ...(row.topic !== null ? { topic: row.topic } : {}),
    capture_client: row.capture_client,
    ...(row.capture_client_version !== null
      ? { capture_client_version: row.capture_client_version }
      : {}),
    ...(row.surface !== null ? { surface: row.surface } : {}),
    ...(row.captured_batch_id !== null
      ? { captured_batch_id: row.captured_batch_id }
      : {}),
    created_at: row.created_at,
  }));
}
