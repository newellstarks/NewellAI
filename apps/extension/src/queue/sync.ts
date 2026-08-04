import type { UploadRequest } from "@newellai/contracts";
import { INVALID_TOKEN_MESSAGE, validateCaptureToken } from "../token";
import { idbRequest, STORES, withTransaction } from "./db";
import { holdPendingAsAuthBlocked, setStatus } from "./queue";
import {
  backoffMs,
  MAX_ATTEMPTS,
  MAX_BATCH_TURNS,
  type DeadLetter,
  type QueueEnvelope,
  type SyncOutcome,
} from "./types";

/**
 * Sync engine (docs/DurableQueue.md, ADR-0006).
 *
 * One batch in flight globally; one conversation per request, max 25 turns,
 * oldest conversation first. Response classification:
 *   200                      → delivered (dequeue regardless of accepted/duplicate)
 *   401                      → auth_blocked; retry budget untouched
 *   400 / 404 / 405          → immediate dead-letter
 *   network error / 5xx      → persisted backoff; dead-letter after 5 attempts
 */

export interface SyncConfig {
  baseUrl: string;
  token: string;
}

/** Resolver result for createSyncRunner (matches config.loadConfig). */
export type SyncConfigLoad =
  | { status: "ready"; config: SyncConfig }
  | { status: "missing" }
  | { status: "invalid_token" };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Sanitize a thrown fetch/sync error for operator status.
 * Stores only error.name and a short safe message — never token, body,
 * turn text, or Authorization headers.
 */
export function sanitizeFetchError(error: unknown): string {
  const name = error instanceof Error && error.name.length > 0 ? error.name : "Error";
  const raw =
    error instanceof Error && typeof error.message === "string"
      ? error.message
      : "unknown";
  const safe = raw
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 120);
  return `network error (${name}: ${safe.length > 0 ? safe : "unknown"})`;
}

/** Callers must not run two syncs concurrently; see createSyncRunner. */
export async function syncOnce(
  db: IDBDatabase,
  config: SyncConfig,
  fetchFn: FetchLike,
  now: number = Date.now(),
): Promise<SyncOutcome> {
  const outcome: SyncOutcome = {
    delivered: 0,
    retried: 0,
    dead_lettered: 0,
    auth_blocked: 0,
    idle: false,
  };

  const tokenCheck = validateCaptureToken(config.token);
  if (!tokenCheck.ok) {
    const blocked = await holdPendingAsAuthBlocked(db);
    await setStatus(db, { last_error: INVALID_TOKEN_MESSAGE });
    outcome.auth_blocked = blocked;
    outcome.idle = blocked === 0;
    return outcome;
  }
  // Use the trimmed, validated token for the Authorization header.
  const safeConfig: SyncConfig = { baseUrl: config.baseUrl, token: tokenCheck.token };

  // Select the due batch and mark it in flight, atomically. Any persisted
  // in-flight items found here are abandoned (the caller serializes syncs),
  // so they revert to pending first.
  const batch = await withTransaction(
    db,
    [STORES.queue],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(STORES.queue);
      const all = (await idbRequest(store.getAll())) as QueueEnvelope[];

      for (const item of all) {
        if (item.state === "in_flight") {
          item.state = "pending";
          store.put(item);
        }
      }

      const due = all.filter(
        (i) => i.state === "pending" && i.next_attempt_at <= now,
      );
      if (due.length === 0) return [];

      // Oldest conversation first.
      const oldestByConversation = new Map<string, number>();
      for (const item of due) {
        const id = item.conversation.conversation_id;
        const current = oldestByConversation.get(id);
        if (current === undefined || item.enqueued_at < current) {
          oldestByConversation.set(id, item.enqueued_at);
        }
      }
      const [targetConversation] = [...oldestByConversation.entries()].sort(
        (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
      )[0]!;

      const selected = due
        .filter((i) => i.conversation.conversation_id === targetConversation)
        .sort((a, b) => (a.turn.sequence ?? 0) - (b.turn.sequence ?? 0))
        .slice(0, MAX_BATCH_TURNS);

      for (const item of selected) {
        store.put({ ...item, state: "in_flight" });
      }
      return selected;
    },
  );

  if (batch.length === 0) {
    outcome.idle = true;
    return outcome;
  }

  const upload: UploadRequest = {
    conversation: batch[0]!.conversation,
    capture: batch[0]!.capture,
    turns: batch.map((item) => item.turn),
  };

  let response: Response | null = null;
  let fetchErrorDiagnostic: string | null = null;
  try {
    response = await fetchFn(`${safeConfig.baseUrl.replace(/\/$/, "")}/v1/turns`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${safeConfig.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(upload),
    });
  } catch (error) {
    // Transient failure; diagnostic is sanitized (no token/body/turn text).
    response = null;
    fetchErrorDiagnostic = sanitizeFetchError(error);
  }

  await applyResult(db, batch, response, now, outcome, fetchErrorDiagnostic);
  return outcome;
}

async function applyResult(
  db: IDBDatabase,
  batch: QueueEnvelope[],
  response: Response | null,
  now: number,
  outcome: SyncOutcome,
  fetchErrorDiagnostic: string | null = null,
): Promise<void> {
  const status = response?.status ?? null;
  // Sanitized reason only: never response bodies or conversation text.
  const permanent = status === 400 || status === 404 || status === 405;

  await withTransaction(
    db,
    [STORES.queue, STORES.dead],
    "readwrite",
    async (tx) => {
      const queue = tx.objectStore(STORES.queue);
      const dead = tx.objectStore(STORES.dead);

      for (const item of batch) {
        if (status === 200) {
          queue.delete(item.queue_id);
          outcome.delivered += 1;
        } else if (status === 401) {
          // Hold without consuming retry budget.
          queue.put({ ...item, state: "auth_blocked" });
          outcome.auth_blocked += 1;
        } else if (permanent) {
          queue.delete(item.queue_id);
          const letter: DeadLetter = {
            envelope: { ...item, state: "pending" },
            reason: `permanent rejection (HTTP ${status})`,
            dead_at: now,
          };
          dead.put(letter);
          outcome.dead_lettered += 1;
        } else {
          // Network error or 5xx: transient.
          const attempts = item.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            queue.delete(item.queue_id);
            const letter: DeadLetter = {
              envelope: { ...item, state: "pending", attempts },
              reason: "max attempts exceeded",
              dead_at: now,
            };
            dead.put(letter);
            outcome.dead_lettered += 1;
          } else {
            queue.put({
              ...item,
              state: "pending",
              attempts,
              next_attempt_at: now + backoffMs(attempts),
            });
            outcome.retried += 1;
          }
        }
      }
    },
  );

  if (status === 200) {
    await setStatus(db, { last_error: null, last_success_at: now });
  } else if (status === 401) {
    await setStatus(db, { last_error: "authentication rejected (401)" });
  } else if (permanent) {
    await setStatus(db, { last_error: `upload rejected (HTTP ${status})` });
  } else {
    await setStatus(db, {
      last_error:
        status === null
          ? (fetchErrorDiagnostic ?? "network error")
          : `server error (HTTP ${status})`,
    });
  }
}

/**
 * Serializes syncs (one batch in flight globally) and drains all due work:
 * repeats while a batch was fully delivered, so multiple conversations and
 * >25-turn backlogs drain without waiting for the next alarm.
 */
export function createSyncRunner(
  db: IDBDatabase,
  getConfig: () => Promise<SyncConfigLoad>,
  fetchFn: FetchLike,
): () => Promise<SyncOutcome> {
  let running: Promise<SyncOutcome> | null = null;

  const run = async (): Promise<SyncOutcome> => {
    const total: SyncOutcome = {
      delivered: 0,
      retried: 0,
      dead_lettered: 0,
      auth_blocked: 0,
      idle: true,
    };
    const loaded = await getConfig();
    if (loaded.status === "missing") return total;
    if (loaded.status === "invalid_token") {
      const blocked = await holdPendingAsAuthBlocked(db);
      await setStatus(db, { last_error: INVALID_TOKEN_MESSAGE });
      total.auth_blocked = blocked;
      total.idle = blocked === 0;
      return total;
    }

    for (;;) {
      const result = await syncOnce(db, loaded.config, fetchFn);
      total.delivered += result.delivered;
      total.retried += result.retried;
      total.dead_lettered += result.dead_lettered;
      total.auth_blocked += result.auth_blocked;
      total.idle = total.idle && result.idle;
      // Continue only when the whole batch succeeded; failures wait for
      // their persisted next_attempt_at.
      if (result.idle || result.delivered === 0 || result.retried > 0) break;
      if (result.auth_blocked > 0) break;
    }
    return total;
  };

  return async () => {
    if (running !== null) return running;
    running = run().finally(() => {
      running = null;
    });
    return running;
  };
}
