/**
 * IndexedDB layer for the Durable Queue (ADR-0006).
 * Stores:
 *   queue      — QueueEnvelope by queue_id (pending / in_flight / auth_blocked)
 *   dead       — DeadLetter by queue_id (retained until manually cleared)
 *   identities — IdentityRecord by [conversation_id, source_key]; persists
 *                after delivery so rescans reuse identity + sequence
 *   sequences  — { conversation_id, next_sequence } per conversation
 *   status     — singleton { last_error, last_success_at }
 *
 * Chrome-free: tests run against fake-indexeddb.
 */

const DB_NAME = "newellai-queue";
const DB_VERSION = 1;

export const STORES = {
  queue: "queue",
  dead: "dead",
  identities: "identities",
  sequences: "sequences",
  status: "status",
} as const;

export function openQueueDb(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const queue = db.createObjectStore(STORES.queue, { keyPath: "queue_id" });
      queue.createIndex("by_state", "state");
      queue.createIndex("by_conversation", "conversation.conversation_id");
      db.createObjectStore(STORES.dead, { keyPath: "envelope.queue_id" });
      db.createObjectStore(STORES.identities, {
        keyPath: ["conversation_id", "source_key"],
      });
      db.createObjectStore(STORES.sequences, { keyPath: "conversation_id" });
      db.createObjectStore(STORES.status, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb open failed"));
  });
}

/** Promise wrapper for a single IDB request. */
export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
  });
}

/** Runs `work` inside one transaction; resolves when the tx completes. */
export function withTransaction<T>(
  db: IDBDatabase,
  storeNames: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result: T;
    let workFailed = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => {
      if (!workFailed) reject(tx.error ?? new Error("transaction aborted"));
    };
    tx.onerror = () => {
      /* handled by onabort */
    };
    work(tx).then(
      (value) => {
        result = value;
      },
      (error: unknown) => {
        workFailed = true;
        try {
          tx.abort();
        } catch {
          /* already aborted */
        }
        reject(error);
      },
    );
  });
}

export async function getAllFromStore<T>(
  db: IDBDatabase,
  storeName: string,
): Promise<T[]> {
  return withTransaction(db, [storeName], "readonly", (tx) =>
    idbRequest(tx.objectStore(storeName).getAll() as IDBRequest<T[]>),
  );
}
