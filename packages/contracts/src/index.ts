/**
 * Wire protocol — shared contracts between every capture client and the backend.
 * Spec: docs/Contracts.md
 */

/** One half-turn (user or assistant). */
export type Speaker = "user" | "assistant";

export interface TurnPayload {
  /** Idempotency key; stable across retries. */
  client_turn_id: string;
  speaker: Speaker;
  /** Message body. */
  text: string;
  /** ISO-8601 from client; server may fill if omitted. */
  captured_at?: string;
  /** Client-assigned order hint within the conversation. */
  sequence?: number;
  /** Link request ↔ response halves. */
  parent_client_turn_id?: string;
  message_type?: string;
  topic?: string;
}

/** Conversation / session context for an upload. */
export interface ConversationMetadata {
  conversation_id: string;
  user_id: string;
  title?: string;
  source_model?: string;
  /** ISO-8601 */
  started_at?: string;
}

/**
 * How/where turns were captured.
 * `capture_client` identifies the adapter (e.g. chrome-extension, manual).
 */
export interface CaptureMetadata {
  capture_client: string;
  capture_client_version?: string;
  surface?: string;
  captured_batch_id?: string;
}

/** Body for authenticated POST /v1/turns. */
export interface UploadRequest {
  conversation: ConversationMetadata;
  capture: CaptureMetadata;
  /** Must be non-empty at runtime (Worker validates). */
  turns: TurnPayload[];
}

/** Successful ingest result. */
export interface UploadResponse {
  accepted: number;
  duplicate: number;
  conversation_id: string;
  turn_ids?: string[];
  /** ISO-8601 */
  server_time: string;
}

/**
 * One conversation in the GET /v1/conversations list.
 * Summary only — never carries turn content.
 */
export interface ConversationSummary {
  conversation_id: string;
  /** Stored account identity (existing field; not tenancy). */
  user_id: string;
  title?: string;
  source_model?: string;
  /** Client-supplied ISO-8601, absent when not stored. */
  started_at?: string;
  /** Server time of first insert (ISO-8601). */
  created_at: string;
  /**
   * MAX(turns.created_at) — list sort key, descending, NULLs last (ISO-8601).
   * `null` for a conversation with no stored turns (possible after a
   * mid-write failure on the non-transactional persistence path).
   */
  last_turn_at: string | null;
  /** 0 when the conversation has no stored turns. */
  turn_count: number;
}

/** Body for GET /v1/conversations. */
export interface ConversationsResponse {
  /**
   * Ordered last_turn_at DESC with NULLs last, then conversation_id ASC;
   * may be empty.
   */
  conversations: ConversationSummary[];
  /** ISO-8601 */
  server_time: string;
}

/**
 * One stored turn as returned by GET /v1/conversations/:id/turns —
 * the persisted form of TurnPayload plus server fields and capture metadata.
 */
export interface TurnRecord {
  /** Server-assigned UUID. */
  turn_id: string;
  conversation_id: string;
  /** Idempotency key as uploaded. */
  client_turn_id: string;
  speaker: Speaker;
  text: string;
  captured_at?: string;
  sequence?: number;
  parent_client_turn_id?: string;
  message_type?: string;
  topic?: string;
  capture_client: string;
  capture_client_version?: string;
  surface?: string;
  captured_batch_id?: string;
  /** Server ingest time (ISO-8601). */
  created_at: string;
}

/** Body for GET /v1/conversations/:id/turns. */
export interface ConversationTurnsResponse {
  conversation_id: string;
  /** Ordered sequence ASC (NULLs last), created_at ASC, turn_id ASC. */
  turns: TurnRecord[];
  /** ISO-8601 */
  server_time: string;
}

/** Stable error envelope for JSON 4xx/5xx bodies. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
