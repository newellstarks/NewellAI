import type { UploadRequest } from "@newellai/contracts";
import { HttpError } from "../errors";

export interface PersistResult {
  accepted: number;
  duplicate: number;
}

/**
 * Persist one validated upload (docs/Database.md).
 *
 * 1. INSERT OR IGNORE user
 * 2. INSERT OR IGNORE conversation (first write wins)
 * 3. Per turn: INSERT ... ON CONFLICT (conversation_id, client_turn_id) DO NOTHING
 *    inserted → accepted, conflict → duplicate
 *
 * No retries — clients retry against this idempotent path.
 */
export async function persistUpload(
  db: D1Database | undefined,
  upload: UploadRequest,
): Promise<PersistResult> {
  if (db === undefined) {
    console.error("DB_CONFIGURATION_MISSING");
    throw new HttpError("INTERNAL_ERROR", "Unexpected server error");
  }

  const now = new Date().toISOString();
  const { conversation, capture, turns } = upload;

  await db
    .prepare("INSERT OR IGNORE INTO users (user_id, created_at) VALUES (?, ?)")
    .bind(conversation.user_id, now)
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO conversations
         (conversation_id, user_id, title, source_model, started_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      conversation.conversation_id,
      conversation.user_id,
      conversation.title ?? null,
      conversation.source_model ?? null,
      conversation.started_at ?? null,
      now,
    )
    .run();

  const insertTurn = db.prepare(
    `INSERT INTO turns
       (turn_id, conversation_id, client_turn_id, speaker, text,
        captured_at, sequence, parent_client_turn_id, message_type, topic,
        capture_client, capture_client_version, surface, captured_batch_id,
        created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (conversation_id, client_turn_id) DO NOTHING`,
  );

  let accepted = 0;
  let duplicate = 0;

  for (const turn of turns) {
    const result = await insertTurn
      .bind(
        crypto.randomUUID(),
        conversation.conversation_id,
        turn.client_turn_id,
        turn.speaker,
        turn.text,
        turn.captured_at ?? null,
        turn.sequence ?? null,
        turn.parent_client_turn_id ?? null,
        turn.message_type ?? null,
        turn.topic ?? null,
        capture.capture_client,
        capture.capture_client_version ?? null,
        capture.surface ?? null,
        capture.captured_batch_id ?? null,
        now,
      )
      .run();

    if (result.meta.changes > 0) {
      accepted += 1;
    } else {
      duplicate += 1;
    }
  }

  return { accepted, duplicate };
}
