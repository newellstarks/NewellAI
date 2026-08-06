import { idbRequest, STORES, withTransaction } from "./db";
import {
  ENVELOPE_SCHEMA_VERSION,
  type DeadLetter,
  type EnqueueInput,
  type EnqueueResult,
  type IdentityRecord,
  type QueueEnvelope,
  type QueueStatus,
} from "./types";

/**
 * Durable Queue operations (docs/DurableQueue.md, ADR-0006).
 *
 * Identity: a stable, validated source-provided identifier is used when
 * available; otherwise a local identity is created and persisted before
 * first enqueue. Re-observation reuses identity and sequence — a rescan
 * never creates another queue item or increments the sequence.
 */

/** Bound shared with capture messaging validation (ADR-0006). */
export const MAX_SOURCE_KEY_LENGTH = 128;

/** Validate a source-provided identifier; reject unusable values. */
export function validateSourceKey(sourceKey: string | undefined): string | null {
  if (sourceKey === undefined) return null;
  const trimmed = sourceKey.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SOURCE_KEY_LENGTH) return null;
  // Control characters indicate a scraping bug, not an identifier.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Accept a normalized turn into durable storage.
 * Atomic across identities + sequences + queue: identity lookup, once-only
 * sequence assignment, and envelope insert commit or fail together.
 * Storage failures reject loudly — never silent eviction.
 */
export async function enqueue(
  db: IDBDatabase,
  input: EnqueueInput,
  now: number = Date.now(),
): Promise<EnqueueResult> {
  const conversationId = input.conversation.conversation_id;
  const validated = validateSourceKey(input.source_key);
  const clientTurnId = validated ?? crypto.randomUUID();
  // Locally minted identities register under their own id so retries of the
  // same enqueue (same source turn) can still be recognized by source_key.
  const sourceKey = validated ?? clientTurnId;

  return withTransaction(
    db,
    [STORES.identities, STORES.sequences, STORES.queue],
    "readwrite",
    async (tx) => {
      const identities = tx.objectStore(STORES.identities);
      const existing = (await idbRequest(
        identities.get([conversationId, sourceKey]),
      )) as IdentityRecord | undefined;
      if (existing !== undefined) {
        return {
          status: "already_known",
          client_turn_id: existing.client_turn_id,
          sequence: existing.sequence,
        };
      }

      const sequences = tx.objectStore(STORES.sequences);
      const counter = (await idbRequest(sequences.get(conversationId))) as
        | { conversation_id: string; next_sequence: number }
        | undefined;
      const sequence = counter?.next_sequence ?? 1;
      sequences.put({ conversation_id: conversationId, next_sequence: sequence + 1 });

      const identity: IdentityRecord = {
        conversation_id: conversationId,
        source_key: sourceKey,
        client_turn_id: clientTurnId,
        sequence,
      };
      identities.put(identity);

      const envelope: QueueEnvelope = {
        schema_version: ENVELOPE_SCHEMA_VERSION,
        queue_id: crypto.randomUUID(),
        state: "pending",
        attempts: 0,
        next_attempt_at: now,
        enqueued_at: now,
        conversation: input.conversation,
        capture: input.capture,
        turn: { ...input.turn, client_turn_id: clientTurnId, sequence },
      };
      tx.objectStore(STORES.queue).put(envelope);

      return { status: "accepted", client_turn_id: clientTurnId, sequence };
    },
  );
}

/**
 * Resolve the durable turn client_turn_id for a conversation + source_key.
 * Used by artifact enqueue so images never invent a parallel identity.
 */
export async function lookupClientTurnId(
  db: IDBDatabase,
  conversationId: string,
  sourceKey: string,
): Promise<string | null> {
  const validated = validateSourceKey(sourceKey);
  if (validated === null) return null;
  return withTransaction(db, [STORES.identities], "readonly", async (tx) => {
    const existing = (await idbRequest(
      tx.objectStore(STORES.identities).get([conversationId, validated]),
    )) as IdentityRecord | undefined;
    return existing?.client_turn_id ?? null;
  });
}

/** Abandoned in-flight items revert to pending on startup (ADR-0006). */
export async function recoverInFlight(db: IDBDatabase): Promise<number> {
  return withTransaction(db, [STORES.queue], "readwrite", async (tx) => {
    const store = tx.objectStore(STORES.queue);
    const stuck = (await idbRequest(
      store.index("by_state").getAll("in_flight"),
    )) as QueueEnvelope[];
    for (const item of stuck) {
      store.put({ ...item, state: "pending" });
    }
    return stuck.length;
  });
}

/** Token was fixed: auth-blocked items become pending again. */
export async function requeueAuthBlocked(db: IDBDatabase): Promise<number> {
  return withTransaction(db, [STORES.queue], "readwrite", async (tx) => {
    const store = tx.objectStore(STORES.queue);
    const blocked = (await idbRequest(
      store.index("by_state").getAll("auth_blocked"),
    )) as QueueEnvelope[];
    for (const item of blocked) {
      store.put({ ...item, state: "pending", next_attempt_at: 0 });
    }
    return blocked.length;
  });
}

/**
 * Hold pending items as auth-blocked without consuming retry attempts
 * (invalid stored token / configuration). Does not touch dead letters.
 */
export async function holdPendingAsAuthBlocked(db: IDBDatabase): Promise<number> {
  return withTransaction(db, [STORES.queue], "readwrite", async (tx) => {
    const store = tx.objectStore(STORES.queue);
    const pending = (await idbRequest(
      store.index("by_state").getAll("pending"),
    )) as QueueEnvelope[];
    for (const item of pending) {
      // attempts unchanged — configuration failure is not a delivery attempt.
      store.put({ ...item, state: "auth_blocked" });
    }
    return pending.length;
  });
}

/**
 * Operator "Sync now": make all pending items due immediately.
 * Does not reset attempts, and does not touch auth_blocked or dead letters.
 * Automatic sweeps continue to respect persisted next_attempt_at / backoff.
 */
export async function forcePendingDue(db: IDBDatabase): Promise<number> {
  return withTransaction(db, [STORES.queue], "readwrite", async (tx) => {
    const store = tx.objectStore(STORES.queue);
    const pending = (await idbRequest(
      store.index("by_state").getAll("pending"),
    )) as QueueEnvelope[];
    for (const item of pending) {
      store.put({ ...item, next_attempt_at: 0 });
    }
    return pending.length;
  });
}

/** Dead letters are retained until manually cleared by the operator. */
export async function clearDeadLetters(db: IDBDatabase): Promise<number> {
  return withTransaction(db, [STORES.dead], "readwrite", async (tx) => {
    const store = tx.objectStore(STORES.dead);
    const count = await idbRequest(store.count());
    store.clear();
    return count;
  });
}

export async function getDeadLetters(db: IDBDatabase): Promise<DeadLetter[]> {
  return withTransaction(db, [STORES.dead], "readonly", (tx) =>
    idbRequest(tx.objectStore(STORES.dead).getAll() as IDBRequest<DeadLetter[]>),
  );
}

interface StatusRecord {
  key: "sync";
  last_error: string | null;
  last_success_at: number | null;
}

export async function setStatus(
  db: IDBDatabase,
  update: { last_error?: string | null; last_success_at?: number },
): Promise<void> {
  await withTransaction(db, [STORES.status], "readwrite", async (tx) => {
    const store = tx.objectStore(STORES.status);
    const current = ((await idbRequest(store.get("sync"))) as
      | StatusRecord
      | undefined) ?? { key: "sync", last_error: null, last_success_at: null };
    store.put({
      ...current,
      ...(update.last_error !== undefined ? { last_error: update.last_error } : {}),
      ...(update.last_success_at !== undefined
        ? { last_success_at: update.last_success_at }
        : {}),
    });
  });
}

/** Operator-facing status; never includes conversation text or the token. */
export async function getStatus(
  db: IDBDatabase,
  now: number = Date.now(),
): Promise<QueueStatus> {
  return withTransaction(
    db,
    [STORES.queue, STORES.dead, STORES.status],
    "readonly",
    async (tx) => {
      const items = (await idbRequest(
        tx.objectStore(STORES.queue).getAll(),
      )) as QueueEnvelope[];
      const dead = await idbRequest(tx.objectStore(STORES.dead).count());
      const status = (await idbRequest(tx.objectStore(STORES.status).get("sync"))) as
        | StatusRecord
        | undefined;

      const pendingItems = items.filter((i) => i.state === "pending");
      const oldest = pendingItems.reduce<number | null>(
        (min, i) => (min === null || i.enqueued_at < min ? i.enqueued_at : min),
        null,
      );
      return {
        pending: pendingItems.length,
        auth_blocked: items.filter((i) => i.state === "auth_blocked").length,
        in_flight: items.filter((i) => i.state === "in_flight").length,
        dead,
        oldest_pending_age_ms: oldest === null ? null : now - oldest,
        last_error: status?.last_error ?? null,
        last_success_at: status?.last_success_at ?? null,
      };
    },
  );
}
