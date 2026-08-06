/**
 * IndexedDB for the sibling Artifact Queue (separate from turn queue DB).
 */

const DB_NAME = "newellai-artifacts";
const DB_VERSION = 1;

export const ARTIFACT_STORES = {
  queue: "queue",
  dead: "dead",
  conflicts: "conflicts",
  identities: "identities",
  status: "status",
} as const;

export function openArtifactDb(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const queue = db.createObjectStore(ARTIFACT_STORES.queue, {
        keyPath: "queue_id",
      });
      queue.createIndex("by_state", "state");
      queue.createIndex("by_conversation", "conversation_id");
      db.createObjectStore(ARTIFACT_STORES.dead, {
        keyPath: "envelope.queue_id",
      });
      db.createObjectStore(ARTIFACT_STORES.conflicts, {
        keyPath: "client_artifact_id",
      });
      db.createObjectStore(ARTIFACT_STORES.identities, {
        keyPath: ["conversation_id", "source_key"],
      });
      db.createObjectStore(ARTIFACT_STORES.status, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("artifact indexeddb open failed"));
  });
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("indexeddb request failed"));
  });
}

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
      /* onabort */
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
