import { ARTIFACT_STORES, idbRequest, withTransaction } from "./db";
import {
  ARTIFACT_ENVELOPE_SCHEMA_VERSION,
  shortenChecksum,
  type ArtifactConflictNotice,
  type ArtifactDeadLetter,
  type ArtifactEnqueueInput,
  type ArtifactEnqueueResult,
  type ArtifactIdentityRecord,
  type ArtifactQueueEnvelope,
  type ArtifactQueueStatus,
} from "./types";

/**
 * Sibling Artifact Queue operations (ADR-0009).
 */

export async function enqueueArtifact(
  db: IDBDatabase,
  input: ArtifactEnqueueInput,
  now: number = Date.now(),
): Promise<ArtifactEnqueueResult> {
  const sourceKey = input.source_key.trim();
  if (sourceKey.length === 0) {
    throw new Error("source_key required");
  }
  const clientArtifactId = sourceKey;

  return withTransaction(
    db,
    [ARTIFACT_STORES.identities, ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      const identities = tx.objectStore(ARTIFACT_STORES.identities);
      const existing = (await idbRequest(
        identities.get([input.conversation_id, sourceKey]),
      )) as ArtifactIdentityRecord | undefined;
      if (existing !== undefined) {
        return {
          status: "already_known",
          client_artifact_id: existing.client_artifact_id,
        };
      }

      identities.put({
        conversation_id: input.conversation_id,
        source_key: sourceKey,
        client_artifact_id: clientArtifactId,
      } satisfies ArtifactIdentityRecord);

      const hasBytes =
        input.bytes !== undefined && input.bytes.byteLength > 0;
      const envelope: ArtifactQueueEnvelope = {
        schema_version: ARTIFACT_ENVELOPE_SCHEMA_VERSION,
        queue_id: crypto.randomUUID(),
        state: "pending",
        attempts: 0,
        next_attempt_at: now,
        enqueued_at: now,
        conversation_id: input.conversation_id,
        user_id: input.user_id,
        client_artifact_id: clientArtifactId,
        client_turn_id: input.client_turn_id,
        direction: input.direction,
        artifact_type: "image",
        mime_type: input.mime_type,
        capture: input.capture,
        byte_status: hasBytes
          ? "ready"
          : input.declared_sha256 !== undefined
            ? "pending_download"
            : "metadata_discovered",
      };
      if (input.declared_sha256 !== undefined) {
        envelope.declared_sha256 = input.declared_sha256;
        envelope.declared_byte_size = input.declared_byte_size;
      }
      if (input.original_filename !== undefined) {
        envelope.original_filename = input.original_filename;
      }
      if (input.image_provenance !== undefined) {
        envelope.image_provenance = input.image_provenance;
      }
      if (input.source_url !== undefined) envelope.source_url = input.source_url;
      if (input.captured_at !== undefined) envelope.captured_at = input.captured_at;
      if (hasBytes && input.bytes !== undefined) envelope.bytes = input.bytes;

      tx.objectStore(ARTIFACT_STORES.queue).put(envelope);
      return { status: "accepted", client_artifact_id: clientArtifactId };
    },
  );
}

/**
 * Attach bytes to an existing pending item (metadata-without-bytes recovery).
 */
export async function attachArtifactBytes(
  db: IDBDatabase,
  conversationId: string,
  clientArtifactId: string,
  bytes: ArrayBuffer,
  declaredSha256: string,
  declaredByteSize: number,
): Promise<boolean> {
  return withTransaction(
    db,
    [ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.queue);
      const all = (await idbRequest(store.getAll())) as ArtifactQueueEnvelope[];
      const item = all.find(
        (e) =>
          e.conversation_id === conversationId &&
          e.client_artifact_id === clientArtifactId &&
          e.byte_status !== "uploaded",
      );
      if (item === undefined) return false;
      item.bytes = bytes;
      item.declared_sha256 = declaredSha256;
      item.declared_byte_size = declaredByteSize;
      item.byte_status = "ready";
      item.state = "pending";
      item.next_attempt_at = Date.now();
      store.put(item);
      return true;
    },
  );
}

export async function recoverArtifactInFlight(db: IDBDatabase): Promise<number> {
  return withTransaction(
    db,
    [ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.queue);
      const all = (await idbRequest(store.getAll())) as ArtifactQueueEnvelope[];
      let n = 0;
      for (const item of all) {
        if (item.state === "in_flight") {
          item.state = "pending";
          store.put(item);
          n += 1;
        }
      }
      return n;
    },
  );
}

export async function forceArtifactPendingDue(db: IDBDatabase): Promise<void> {
  const now = Date.now();
  await withTransaction(db, [ARTIFACT_STORES.queue], "readwrite", async (tx) => {
    const store = tx.objectStore(ARTIFACT_STORES.queue);
    const all = (await idbRequest(store.getAll())) as ArtifactQueueEnvelope[];
    for (const item of all) {
      if (item.state === "pending" || item.state === "auth_blocked") {
        item.next_attempt_at = now;
        if (item.state === "auth_blocked") item.state = "pending";
        store.put(item);
      }
    }
  });
}

export async function requeueArtifactAuthBlocked(
  db: IDBDatabase,
): Promise<number> {
  return withTransaction(
    db,
    [ARTIFACT_STORES.queue],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.queue);
      const all = (await idbRequest(store.getAll())) as ArtifactQueueEnvelope[];
      let n = 0;
      for (const item of all) {
        if (item.state === "auth_blocked") {
          item.state = "pending";
          item.next_attempt_at = Date.now();
          store.put(item);
          n += 1;
        }
      }
      return n;
    },
  );
}

export async function setArtifactStatus(
  db: IDBDatabase,
  patch: { last_error?: string | null; last_success_at?: number | null },
): Promise<void> {
  await withTransaction(
    db,
    [ARTIFACT_STORES.status],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.status);
      const current = ((await idbRequest(store.get("singleton"))) as
        | { key: string; last_error: string | null; last_success_at: number | null }
        | undefined) ?? {
        key: "singleton",
        last_error: null,
        last_success_at: null,
      };
      if ("last_error" in patch) current.last_error = patch.last_error ?? null;
      if ("last_success_at" in patch) {
        current.last_success_at = patch.last_success_at ?? null;
      }
      store.put(current);
    },
  );
}

export async function getArtifactStatus(
  db: IDBDatabase,
): Promise<ArtifactQueueStatus> {
  return withTransaction(
    db,
    [
      ARTIFACT_STORES.queue,
      ARTIFACT_STORES.dead,
      ARTIFACT_STORES.conflicts,
      ARTIFACT_STORES.status,
    ],
    "readonly",
    async (tx) => {
      const queue = (await idbRequest(
        tx.objectStore(ARTIFACT_STORES.queue).getAll(),
      )) as ArtifactQueueEnvelope[];
      const dead = (await idbRequest(
        tx.objectStore(ARTIFACT_STORES.dead).getAll(),
      )) as ArtifactDeadLetter[];
      const conflicts = (await idbRequest(
        tx.objectStore(ARTIFACT_STORES.conflicts).getAll(),
      )) as ArtifactConflictNotice[];
      const statusRow = (await idbRequest(
        tx.objectStore(ARTIFACT_STORES.status).get("singleton"),
      )) as
        | { last_error: string | null; last_success_at: number | null }
        | undefined;

      const pending = queue.filter((i) => i.state === "pending");
      const auth = queue.filter((i) => i.state === "auth_blocked");
      const inflight = queue.filter((i) => i.state === "in_flight");
      const openConflicts = conflicts.filter((c) => !c.dismissed);
      let oldest: number | null = null;
      const now = Date.now();
      for (const item of pending) {
        const age = now - item.enqueued_at;
        if (oldest === null || age > oldest) oldest = age;
      }
      return {
        pending: pending.length,
        auth_blocked: auth.length,
        in_flight: inflight.length,
        dead: dead.length,
        conflicts: openConflicts.length,
        oldest_pending_age_ms: oldest,
        last_error: statusRow?.last_error ?? null,
        last_success_at: statusRow?.last_success_at ?? null,
      };
    },
  );
}

export async function listOpenArtifactConflicts(
  db: IDBDatabase,
): Promise<ArtifactConflictNotice[]> {
  return withTransaction(
    db,
    [ARTIFACT_STORES.conflicts],
    "readonly",
    async (tx) => {
      const all = (await idbRequest(
        tx.objectStore(ARTIFACT_STORES.conflicts).getAll(),
      )) as ArtifactConflictNotice[];
      return all.filter((c) => !c.dismissed);
    },
  );
}

export async function dismissArtifactConflict(
  db: IDBDatabase,
  clientArtifactId: string,
): Promise<boolean> {
  return withTransaction(
    db,
    [ARTIFACT_STORES.conflicts],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(ARTIFACT_STORES.conflicts);
      const row = (await idbRequest(store.get(clientArtifactId))) as
        | ArtifactConflictNotice
        | undefined;
      if (row === undefined) return false;
      row.dismissed = true;
      store.put(row);
      return true;
    },
  );
}

export async function clearArtifactDeadLetters(db: IDBDatabase): Promise<number> {
  return withTransaction(db, [ARTIFACT_STORES.dead], "readwrite", async (tx) => {
    const store = tx.objectStore(ARTIFACT_STORES.dead);
    const all = (await idbRequest(store.getAll())) as ArtifactDeadLetter[];
    for (const item of all) {
      store.delete(item.envelope.queue_id);
    }
    return all.length;
  });
}

export function conflictNoticeFromEnvelope(
  envelope: ArtifactQueueEnvelope,
  reason: string,
  now: number = Date.now(),
): ArtifactConflictNotice {
  const notice: ArtifactConflictNotice = {
    client_artifact_id: envelope.client_artifact_id,
    conversation_id: envelope.conversation_id,
    artifact_type: envelope.artifact_type,
    reason,
    conflict_at: now,
    dismissed: false,
  };
  if (envelope.original_filename !== undefined) {
    notice.original_filename = envelope.original_filename;
  }
  const fp = shortenChecksum(envelope.declared_sha256);
  if (fp !== undefined) notice.checksum_fingerprint = fp;
  return notice;
}
