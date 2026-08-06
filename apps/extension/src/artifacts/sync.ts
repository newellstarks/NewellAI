import type {
  ArtifactAcceptResponse,
  ArtifactCreateRequest,
} from "@newellai/contracts";
import { INVALID_TOKEN_MESSAGE, validateCaptureToken } from "../token";
import { ARTIFACT_STORES, idbRequest, withTransaction } from "./db";
import {
  conflictNoticeFromEnvelope,
  setArtifactStatus,
} from "./queue";
import {
  ARTIFACT_MAX_ATTEMPTS,
  artifactBackoffMs,
  type ArtifactDeadLetter,
  type ArtifactQueueEnvelope,
  type ArtifactSyncOutcome,
} from "./types";

export interface ArtifactSyncConfig {
  baseUrl: string;
  token: string;
}

export type ArtifactSyncConfigLoad =
  | { status: "ready"; config: ArtifactSyncConfig }
  | { status: "missing" }
  | { status: "invalid_token" };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function sanitizeArtifactFetchError(error: unknown): string {
  const name =
    error instanceof Error && error.name.length > 0 ? error.name : "Error";
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

/**
 * Sync one artifact transfer (≤1 in flight). POST metadata then PUT bytes.
 */
export async function syncArtifactOnce(
  db: IDBDatabase,
  config: ArtifactSyncConfig,
  fetchFn: FetchLike,
  now: number = Date.now(),
): Promise<ArtifactSyncOutcome> {
  const outcome: ArtifactSyncOutcome = {
    delivered: 0,
    retried: 0,
    dead_lettered: 0,
    auth_blocked: 0,
    conflicts: 0,
    idle: false,
  };

  const tokenCheck = validateCaptureToken(config.token);
  if (!tokenCheck.ok) {
    const blocked = await holdArtifactAuthBlocked(db);
    await setArtifactStatus(db, { last_error: INVALID_TOKEN_MESSAGE });
    outcome.auth_blocked = blocked;
    outcome.idle = blocked === 0;
    return outcome;
  }
  const safeConfig: ArtifactSyncConfig = {
    baseUrl: config.baseUrl.replace(/\/$/, ""),
    token: tokenCheck.token,
  };

  const item = await selectDueArtifact(db, now);
  if (item === null) {
    outcome.idle = true;
    return outcome;
  }

  try {
    // Phase 1 — POST metadata
    let artifactId = item.artifact_id;
    if (artifactId === undefined) {
      const createBody: ArtifactCreateRequest = {
        client_artifact_id: item.client_artifact_id,
        conversation_id: item.conversation_id,
        user_id: item.user_id,
        client_turn_id: item.client_turn_id,
        direction: item.direction,
        artifact_type: "image",
        mime_type: item.mime_type,
        capture: item.capture,
      };
      if (item.declared_sha256 !== undefined) {
        createBody.declared_sha256 = item.declared_sha256;
        createBody.declared_byte_size = item.declared_byte_size;
      }
      if (item.original_filename !== undefined) {
        createBody.original_filename = item.original_filename;
      }
      if (item.image_provenance !== undefined) {
        createBody.image_provenance = item.image_provenance;
      }
      if (item.source_key !== undefined) createBody.source_key = item.source_key;
      if (item.captured_at !== undefined) createBody.captured_at = item.captured_at;

      const postRes = await fetchFn(`${safeConfig.baseUrl}/v1/artifacts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${safeConfig.token}`,
        },
        body: JSON.stringify(createBody),
      });

      if (postRes.status === 401) {
        await markArtifactAuthBlocked(db, item.queue_id);
        await setArtifactStatus(db, { last_error: "Unauthorized" });
        outcome.auth_blocked = 1;
        return outcome;
      }
      if (postRes.status === 409) {
        await conflictAndRemove(db, item, "checksum_conflict");
        outcome.conflicts = 1;
        return outcome;
      }
      if (postRes.status >= 400 && postRes.status < 500) {
        await deadLetterArtifact(db, item, `http_${postRes.status}`);
        outcome.dead_lettered = 1;
        return outcome;
      }
      if (!postRes.ok) {
        await retryOrDead(db, item, `http_${postRes.status}`, now, outcome);
        return outcome;
      }
      const accepted = (await postRes.json()) as ArtifactAcceptResponse;
      artifactId = accepted.artifact_id;
      await patchEnvelope(db, item.queue_id, { artifact_id: artifactId });
    }

    // Metadata without bytes — wait for content-script recovery.
    if (item.bytes === undefined || item.bytes.byteLength === 0) {
      await patchEnvelope(db, item.queue_id, {
        state: "pending",
        byte_status: "pending_download",
        next_attempt_at: now + artifactBackoffMs(Math.max(1, item.attempts)),
        attempts: item.attempts,
      });
      outcome.retried = 1;
      return outcome;
    }

    // Phase 2 — PUT content
    const putRes = await fetchFn(
      `${safeConfig.baseUrl}/v1/artifacts/${artifactId}/content`,
      {
        method: "PUT",
        headers: {
          "content-type": item.mime_type,
          Authorization: `Bearer ${safeConfig.token}`,
        },
        body: item.bytes,
      },
    );

    if (putRes.status === 401) {
      await markArtifactAuthBlocked(db, item.queue_id);
      await setArtifactStatus(db, { last_error: "Unauthorized" });
      outcome.auth_blocked = 1;
      return outcome;
    }
    if (putRes.status === 409) {
      await conflictAndRemove(db, item, "checksum_conflict");
      outcome.conflicts = 1;
      return outcome;
    }
    if (putRes.status >= 400 && putRes.status < 500) {
      await deadLetterArtifact(db, item, `http_${putRes.status}`);
      outcome.dead_lettered = 1;
      return outcome;
    }
    if (!putRes.ok) {
      await retryOrDead(db, item, `http_${putRes.status}`, now, outcome);
      return outcome;
    }

    await dequeueArtifact(db, item.queue_id);
    await setArtifactStatus(db, {
      last_error: null,
      last_success_at: now,
    });
    outcome.delivered = 1;
    return outcome;
  } catch (error) {
    await retryOrDead(
      db,
      item,
      sanitizeArtifactFetchError(error),
      now,
      outcome,
    );
    return outcome;
  }
}

async function selectDueArtifact(
  db: IDBDatabase,
  now: number,
): Promise<ArtifactQueueEnvelope | null> {
  return withTransaction(
    db,
    [ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.queue);
      const all = (await idbRequest(store.getAll())) as ArtifactQueueEnvelope[];
      for (const item of all) {
        if (item.state === "in_flight") {
          item.state = "pending";
          store.put(item);
        }
      }
      const due = all
        .filter((i) => i.state === "pending" && i.next_attempt_at <= now)
        .sort((a, b) => a.enqueued_at - b.enqueued_at);
      const selected = due[0];
      if (selected === undefined) return null;
      selected.state = "in_flight";
      store.put(selected);
      return selected;
    },
  );
}

async function holdArtifactAuthBlocked(db: IDBDatabase): Promise<number> {
  return withTransaction(
    db,
    [ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.queue);
      const all = (await idbRequest(store.getAll())) as ArtifactQueueEnvelope[];
      let n = 0;
      for (const item of all) {
        if (item.state === "pending" || item.state === "in_flight") {
          item.state = "auth_blocked";
          store.put(item);
          n += 1;
        }
      }
      return n;
    },
  );
}

async function markArtifactAuthBlocked(
  db: IDBDatabase,
  queueId: string,
): Promise<void> {
  await patchEnvelope(db, queueId, { state: "auth_blocked" });
}

async function patchEnvelope(
  db: IDBDatabase,
  queueId: string,
  patch: Partial<ArtifactQueueEnvelope>,
): Promise<void> {
  await withTransaction(
    db,
    [ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.queue);
      const item = (await idbRequest(store.get(queueId))) as
        | ArtifactQueueEnvelope
        | undefined;
      if (item === undefined) return;
      Object.assign(item, patch);
      store.put(item);
    },
  );
}

async function dequeueArtifact(db: IDBDatabase, queueId: string): Promise<void> {
  await withTransaction(
    db,
    [ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      tx.objectStore(ARTIFACT_STORES.queue).delete(queueId);
    },
  );
}

async function deadLetterArtifact(
  db: IDBDatabase,
  item: ArtifactQueueEnvelope,
  reason: string,
): Promise<void> {
  await withTransaction(
    db,
    [ARTIFACT_STORES.queue, ARTIFACT_STORES.dead],
    "readwrite",
    async (tx) => {
      tx.objectStore(ARTIFACT_STORES.queue).delete(item.queue_id);
      const copy = { ...item };
      delete copy.bytes;
      const dead: ArtifactDeadLetter = {
        envelope: copy,
        reason,
        dead_at: Date.now(),
      };
      tx.objectStore(ARTIFACT_STORES.dead).put(dead);
    },
  );
  await setArtifactStatus(db, { last_error: reason });
}

async function conflictAndRemove(
  db: IDBDatabase,
  item: ArtifactQueueEnvelope,
  reason: string,
): Promise<void> {
  const notice = conflictNoticeFromEnvelope(item, reason);
  await withTransaction(
    db,
    [ARTIFACT_STORES.queue, ARTIFACT_STORES.conflicts],
    "readwrite",
    async (tx) => {
      tx.objectStore(ARTIFACT_STORES.queue).delete(item.queue_id);
      tx.objectStore(ARTIFACT_STORES.conflicts).put(notice);
    },
  );
  await setArtifactStatus(db, { last_error: "artifact_checksum_conflict" });
}

async function retryOrDead(
  db: IDBDatabase,
  item: ArtifactQueueEnvelope,
  reason: string,
  now: number,
  outcome: ArtifactSyncOutcome,
): Promise<void> {
  const attempts = item.attempts + 1;
  if (attempts >= ARTIFACT_MAX_ATTEMPTS) {
    await deadLetterArtifact(db, item, reason);
    outcome.dead_lettered = 1;
    return;
  }
  await patchEnvelope(db, item.queue_id, {
    state: "pending",
    attempts,
    next_attempt_at: now + artifactBackoffMs(attempts),
  });
  await setArtifactStatus(db, { last_error: reason });
  outcome.retried = 1;
}

export function createArtifactSyncRunner(
  db: IDBDatabase,
  loadConfig: () => Promise<ArtifactSyncConfigLoad>,
  fetchFn: FetchLike,
): () => Promise<ArtifactSyncOutcome> {
  let busy = false;
  return async () => {
    if (busy) {
      return {
        delivered: 0,
        retried: 0,
        dead_lettered: 0,
        auth_blocked: 0,
        conflicts: 0,
        idle: true,
      };
    }
    busy = true;
    try {
      const loaded = await loadConfig();
      if (loaded.status === "missing") {
        return {
          delivered: 0,
          retried: 0,
          dead_lettered: 0,
          auth_blocked: 0,
          conflicts: 0,
          idle: true,
        };
      }
      if (loaded.status === "invalid_token") {
        const blocked = await holdArtifactAuthBlocked(db);
        await setArtifactStatus(db, { last_error: INVALID_TOKEN_MESSAGE });
        return {
          delivered: 0,
          retried: 0,
          dead_lettered: 0,
          auth_blocked: blocked,
          conflicts: 0,
          idle: blocked === 0,
        };
      }
      return syncArtifactOnce(db, loaded.config, fetchFn);
    } finally {
      busy = false;
    }
  };
}
