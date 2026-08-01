import type {
  CaptureMetadata,
  ConversationMetadata,
  TurnPayload,
} from "@newellai/contracts";

/**
 * Durable Queue types (docs/DurableQueue.md, ADR-0006).
 * Core modules are chrome-free; the background worker adapts them.
 */

export const ENVELOPE_SCHEMA_VERSION = 1;

/** Dead items live in a separate store, so "dead" is not a queue state. */
export type QueueState = "pending" | "in_flight" | "auth_blocked";

/** Versioned, self-contained queue envelope (ADR-0006). */
export interface QueueEnvelope {
  schema_version: number;
  /** Local queue identity (not the wire id). */
  queue_id: string;
  state: QueueState;
  /** Delivery attempts consumed (401 does not count). */
  attempts: number;
  /** Epoch ms; item is due when next_attempt_at <= now. */
  next_attempt_at: number;
  /** Epoch ms at durable acceptance. */
  enqueued_at: number;
  conversation: ConversationMetadata;
  capture: CaptureMetadata;
  /** Wire payload; client_turn_id and sequence are fixed at acceptance. */
  turn: TurnPayload;
}

/** Dead-letter record: the envelope plus why it was poisoned. */
export interface DeadLetter {
  envelope: QueueEnvelope;
  /** Sanitized reason, e.g. "VALIDATION_ERROR" or "max attempts exceeded". */
  reason: string;
  dead_at: number;
}

/**
 * Identity registry entry — persists after delivery so rescans reuse
 * identity and sequence instead of re-enqueueing (ADR-0006).
 */
export interface IdentityRecord {
  conversation_id: string;
  /** Validated source identifier, or the locally minted id. */
  source_key: string;
  client_turn_id: string;
  sequence: number;
}

/** Input to enqueue: a normalized turn before identity/sequence assignment. */
export interface EnqueueInput {
  conversation: ConversationMetadata;
  capture: CaptureMetadata;
  /**
   * Stable source-provided identifier when available and validated.
   * The contract names no specific DOM attribute; adapters extract it.
   */
  source_key?: string;
  turn: Omit<TurnPayload, "client_turn_id" | "sequence">;
}

export type EnqueueResult =
  | { status: "accepted"; client_turn_id: string; sequence: number }
  | { status: "already_known"; client_turn_id: string; sequence: number };

/** Sync status surfaced to the operator (no conversation text, no token). */
export interface QueueStatus {
  pending: number;
  auth_blocked: number;
  in_flight: number;
  dead: number;
  oldest_pending_age_ms: number | null;
  last_error: string | null;
  last_success_at: number | null;
}

export interface SyncOutcome {
  delivered: number;
  retried: number;
  dead_lettered: number;
  auth_blocked: number;
  /** True when nothing was due. */
  idle: boolean;
}

export const RETRY_BASE_MS = 5_000;
export const RETRY_CAP_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_BATCH_TURNS = 25;

/** Persisted exponential backoff: 5 s doubling to a 5-minute cap. */
export function backoffMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_CAP_MS);
}
