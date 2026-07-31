/**
 * Shared contracts — client-agnostic vocabulary for all capture clients
 * and the Cloudflare Worker. Spec: docs/Contracts.md
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

/** Stable error envelope for JSON 4xx/5xx bodies. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
